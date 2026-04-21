export interface Point {
  lat: number;
  lon: number;
  ele: number;
  dist: number; // Acc distance in km
  asc: number;  // Acc ascent in m
  desc: number; // Acc descent in m
}

export interface Waypoint {
  name: string;
  lat: number;
  lon: number;
  dist: number; // Matched distance on track in km
}

export interface GpxData {
  points: Point[];
  waypoints: Waypoint[];
  totalDistance: number;
  totalAscent: number;
  totalDescent: number;
}

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const ELEVATION_THRESHOLD = 0.5;
const SMOOTHING_WINDOW = 5;

export function parseGPX(gpxText: string): GpxData {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(gpxText, 'text/xml');

  const trkpts = xmlDoc.getElementsByTagName('trkpt');
  
  // First pass: extract raw positions and elevations
  const rawPoints: { lat: number, lon: number, ele: number }[] = [];
  for (let i = 0; i < trkpts.length; i++) {
    const pt = trkpts[i];
    const lat = parseFloat(pt.getAttribute('lat') || '0');
    const lon = parseFloat(pt.getAttribute('lon') || '0');
    const eleNode = pt.getElementsByTagName('ele')[0];
    const ele = eleNode && eleNode.textContent ? parseFloat(eleNode.textContent) : 0;
    rawPoints.push({ lat, lon, ele });
  }

  // Smooth elevation data using a simple moving average
  const smoothedEles = rawPoints.map((pt, i, arr) => {
    let sum = 0;
    let count = 0;
    const halfWindow = Math.floor(SMOOTHING_WINDOW / 2);
    for (let j = Math.max(0, i - halfWindow); j <= Math.min(arr.length - 1, i + halfWindow); j++) {
      sum += arr[j].ele;
      count++;
    }
    return sum / count;
  });

  const points: Point[] = [];
  let totalDistance = 0;
  let totalAscent = 0;
  let totalDescent = 0;
  
  let validEleCount = 0;
  let lastEle = 0;

  for (let i = 0; i < rawPoints.length; i++) {
    const { lat, lon } = rawPoints[i];
    const ele = smoothedEles[i];

    if (i > 0) {
      const prevPt = points[i - 1];
      const dist = getDistanceFromLatLonInKm(prevPt.lat, prevPt.lon, lat, lon);
      totalDistance += dist;

      if (validEleCount > 0) {
        const eleDiff = ele - lastEle;
        if (Math.abs(eleDiff) > ELEVATION_THRESHOLD) {
          if (eleDiff > 0) totalAscent += eleDiff;
          else if (eleDiff < 0) totalDescent += Math.abs(eleDiff);
          lastEle = ele;
        }
      } else {
        lastEle = ele;
        validEleCount++;
      }
    } else {
      lastEle = ele;
      validEleCount++;
    }

    points.push({
      lat,
      lon,
      ele,
      dist: totalDistance,
      asc: totalAscent,
      desc: totalDescent,
    });
  }

  const wpts = xmlDoc.getElementsByTagName('wpt');
  const waypoints: Waypoint[] = [];

  for (let i = 0; i < wpts.length; i++) {
    const pt = wpts[i];
    const lat = parseFloat(pt.getAttribute('lat') || '0');
    const lon = parseFloat(pt.getAttribute('lon') || '0');
    const nameNode = pt.getElementsByTagName('name')[0];
    const name = nameNode && nameNode.textContent ? nameNode.textContent : `WPT ${i + 1}`;

    // Find closest point on track
    let minDist = Infinity;
    let matchedDist = 0;
    
    // basic bounding check could be added, but O(N*M) is fine for typically <10k points and <100 wpts
    for (const trkPt of points) {
      const d = getDistanceFromLatLonInKm(lat, lon, trkPt.lat, trkPt.lon);
      if (d < minDist) {
        minDist = d;
        matchedDist = trkPt.dist;
      }
    }

    waypoints.push({
      name,
      lat,
      lon,
      dist: matchedDist,
    });
  }

  waypoints.sort((a, b) => a.dist - b.dist);

  return {
    points,
    waypoints,
    totalDistance,
    totalAscent,
    totalDescent,
  };
}

export interface Segment {
  id: string;
  name: string;
  startDist: number;
  endDist: number;
  distance: number;
  ascent: number;
  descent: number;
  eph: number;
  ephScale: number; // percentage weighting, default 100
  restTime: number; // minutes
  note?: string; // remark or note
}

export function extractSegmentsFromWaypoints(gpxData: GpxData, defaultEph: number = 10): Segment[] {
  const segments: Segment[] = [];
  let currentDist = 0;
  
  if (gpxData.points.length === 0) return [];
  
  const wpts = [...gpxData.waypoints];
  const lastPoint = gpxData.points[gpxData.points.length - 1];

  if (wpts.length === 0 || wpts[wpts.length - 1].dist < gpxData.totalDistance - 0.05) {
    wpts.push({
        name: '終點',
        lat: lastPoint.lat,
        lon: lastPoint.lon,
        dist: gpxData.totalDistance
    });
  } else {
    wpts[wpts.length - 1].dist = gpxData.totalDistance;
    wpts[wpts.length - 1].lat = lastPoint.lat;
    wpts[wpts.length - 1].lon = lastPoint.lon;
  }
  
  for (let i = 0; i < wpts.length; i++) {
    const wpt = wpts[i];
    
    const endPointMatch = (i === wpts.length - 1)
      ? lastPoint
      : gpxData.points.reduce((prev, curr) => 
          Math.abs(curr.dist - wpt.dist) < Math.abs(prev.dist - wpt.dist) ? curr : prev
        );
    
    const startPointMatch = gpxData.points.reduce((prev, curr) => 
      Math.abs(curr.dist - currentDist) < Math.abs(prev.dist - currentDist) ? curr : prev
    );

    const distance = endPointMatch.dist - startPointMatch.dist;
    const ascent = endPointMatch.asc - startPointMatch.asc;
    const descent = endPointMatch.desc - startPointMatch.desc;
    
    if (distance > 0.01) {
      segments.push({
        id: `wpt-seg-${i}-${Date.now()}`,
        name: wpt.name,
        startDist: currentDist,
        endDist: endPointMatch.dist,
        distance,
        ascent,
        descent,
        eph: defaultEph,
        ephScale: 100,
        restTime: 0
      });
      currentDist = endPointMatch.dist;
    }
  }
  
  return segments;
}

export function generateEvenSegments(gpxData: GpxData, count: number, defaultEph: number = 10): Segment[] {
  const segments: Segment[] = [];
  if (gpxData.points.length === 0 || count <= 0) return [];
  
  const segmentLength = gpxData.totalDistance / count;
  let currentDist = 0;
  
  for (let i = 0; i < count; i++) {
    const targetEndDist = Math.min((i + 1) * segmentLength, gpxData.totalDistance);
    
    const startPointMatch = gpxData.points.reduce((prev, curr) => 
      Math.abs(curr.dist - currentDist) < Math.abs(prev.dist - currentDist) ? curr : prev
    );
    const endPointMatch = (i === count - 1)
      ? gpxData.points[gpxData.points.length - 1]
      : gpxData.points.reduce((prev, curr) => 
          Math.abs(curr.dist - targetEndDist) < Math.abs(prev.dist - targetEndDist) ? curr : prev
        );

    const distance = endPointMatch.dist - startPointMatch.dist;
    const ascent = endPointMatch.asc - startPointMatch.asc;
    const descent = endPointMatch.desc - startPointMatch.desc;
    
    segments.push({
      id: `even-seg-${i}-${Date.now()}`,
      name: `第 ${i + 1} 段`,
      startDist: currentDist,
      endDist: endPointMatch.dist,
      distance,
      ascent,
      descent,
      eph: defaultEph,
      ephScale: 100,
      restTime: 0
    });
    
    currentDist = targetEndDist;
  }
  
  return segments;
}
