import { socket } from './socket';

export interface TrackerData {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: number;
  label: string;
  color: string;
  fiducialId?: number;
}

class TuioTrackerService {
  private subscribers: Set<(data: TrackerData) => void> = new Set();

  constructor() {
    // Listen to object updates broadcasted by the server and filter for those driven by TUIO fiducials
    socket.on('object:updated', (obj: TrackerData) => {
      if (obj.fiducialId !== undefined) {
        this.handleTuioUpdate(obj);
      }
    });
  }

  private handleTuioUpdate(obj: TrackerData) {
    // Log the incoming tracking data for miniature movement
    console.log(
      `[TUIO Service] Tracker Data Received -> Fiducial: ${obj.fiducialId} | Pos: (${Math.round(obj.x)}, ${Math.round(obj.y)}) | Rot: ${Math.round(obj.rotation)}°`
    );
    this.subscribers.forEach((callback) => callback(obj));
  }

  /**
   * Subscribe to TUIO tracker updates.
   * @param callback Function to be called when tracking data is received
   * @returns Unsubscribe function
   */
  public subscribe(callback: (data: TrackerData) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }
}

export const tuioService = new TuioTrackerService();
