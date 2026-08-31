import arousal1 from '../../assets/vad/arousal-1.png';
import arousal2 from '../../assets/vad/arousal-2.png';
import arousal3 from '../../assets/vad/arousal-3.png';
import arousal4 from '../../assets/vad/arousal-4.png';
import arousal5 from '../../assets/vad/arousal-5.png';
import arousal6 from '../../assets/vad/arousal-6.png';
import arousal7 from '../../assets/vad/arousal-7.png';
import arousal8 from '../../assets/vad/arousal-8.png';
import arousal9 from '../../assets/vad/arousal-9.png';
import dominance1 from '../../assets/vad/dominance-1.png';
import dominance2 from '../../assets/vad/dominance-2.png';
import dominance3 from '../../assets/vad/dominance-3.png';
import dominance4 from '../../assets/vad/dominance-4.png';
import dominance5 from '../../assets/vad/dominance-5.png';
import dominance6 from '../../assets/vad/dominance-6.png';
import dominance7 from '../../assets/vad/dominance-7.png';
import dominance8 from '../../assets/vad/dominance-8.png';
import dominance9 from '../../assets/vad/dominance-9.png';
import valence1 from '../../assets/vad/valence-1.png';
import valence2 from '../../assets/vad/valence-2.png';
import valence3 from '../../assets/vad/valence-3.png';
import valence4 from '../../assets/vad/valence-4.png';
import valence5 from '../../assets/vad/valence-5.png';
import valence6 from '../../assets/vad/valence-6.png';
import valence7 from '../../assets/vad/valence-7.png';
import valence8 from '../../assets/vad/valence-8.png';
import valence9 from '../../assets/vad/valence-9.png';

export const VAD_ASSETS = {
  arousal: [arousal1, arousal2, arousal3, arousal4, arousal5, arousal6, arousal7, arousal8, arousal9],
  dominance: [
    dominance1,
    dominance2,
    dominance3,
    dominance4,
    dominance5,
    dominance6,
    dominance7,
    dominance8,
    dominance9,
  ],
  valence: [valence1, valence2, valence3, valence4, valence5, valence6, valence7, valence8, valence9],
} as const;

export type VadDimension = keyof typeof VAD_ASSETS;
