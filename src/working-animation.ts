import { WORKING_ANIMATION_FRAMES, WORKING_ANIMATION_MS } from "./constants";
import { LoopingAnimation } from "./looping-animation";

export class WorkingAnimation extends LoopingAnimation {
  constructor(onFrame: () => void) {
    super(onFrame, WORKING_ANIMATION_FRAMES, WORKING_ANIMATION_MS);
  }
}
