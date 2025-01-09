import { KeyboardHandler } from 'resources/keyboard_handler';
import { HybridAlgorithmsService } from './../../resources/services/hybrid_algorithms_service';
import { GlobalDefinition } from 'resources/global_definitions';

export class ThreeCanvas {

  // we inject here the keyboardHandler functions
  // do not delete
  constructor(
    private globalObjectInstance: GlobalDefinition,
    private hybridAlgorithmsService: HybridAlgorithmsService,
    // do not delete
    private keyboardHandler: KeyboardHandler

  ) {
  }

  attached() {
    //get html element by id
    const element = document.getElementById('container');
    this.globalObjectInstance.elementContainer = element;

    // set steady rendering at least every second
    //set intervall
    setInterval(() => {
      this.globalObjectInstance.render = true;
    }, 1000);


    // Set an interval to periodically update attributes of the global object instance
    setInterval(() => {
      if (this.globalObjectInstance.tabContext.length > 0) {
        this.hybridAlgorithmsService.updateHybridAlgorithmAttributes();
      }
    }, 1000);
  }
}


