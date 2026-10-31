export interface PhotoAsset {
  id: string;
  uri: string;
  filename?: string;
  creationTime: number; // timestamp in ms
  width: number;
  height: number;
  mediaType: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}
