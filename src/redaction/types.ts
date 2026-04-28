export interface Detection {
  type: string;
  start: number;
  end: number;
  original: string;
  placeholder: string;
}

export type Detector = (text: string) => Detection[];
