import { MathUtility } from './services/math_utility';
import { IntervalHandler } from './interval_handler';
import { GlobalSelectedObject } from './global_selected_object';
import { EventAggregator, singleton } from 'aurelia';
import { GlobalDefinition } from './global_definitions';
import { DeletionHandler } from './deletion_handler';
import * as Mousetrap from 'mousetrap';
import { DialogHelper } from './dialog_helper';

@singleton()
export class KeyboardHandler {

  constructor(
    private globalObjectInstance: GlobalDefinition,
    private globalSelectedObject: GlobalSelectedObject,
    private deletionHandler: DeletionHandler,
    private mathUtility: MathUtility,
    private eventAggregator: EventAggregator) {


    Mousetrap.bind('del', async () =>  {
      await this.deletionHandler.onPressDelete();

    });


    Mousetrap.bind('left', () => {
      this.mathUtility.roundPosOfObject(this.globalSelectedObject.getObject(), 10);
      this.globalSelectedObject.getObject().position.x -= 0.1;
      this.globalSelectedObject.getObject();
      this.globalObjectInstance.render = true;
    });

    Mousetrap.bind('right', () => {
      this.mathUtility.roundPosOfObject(this.globalSelectedObject.getObject(), 10);
      this.globalSelectedObject.getObject().position.x += 0.1;
      this.globalSelectedObject.getObject();
      this.globalObjectInstance.render = true;
    });

    Mousetrap.bind('up', () => {
        this.mathUtility.roundPosOfObject(this.globalSelectedObject.getObject(), 100);
        this.globalSelectedObject.getObject().position.y += 0.1;
        this.globalSelectedObject.getObject();
        this.globalObjectInstance.render = true;
    });

    Mousetrap.bind('down', () => {
        this.mathUtility.roundPosOfObject(this.globalSelectedObject.getObject(), 100);
        this.globalSelectedObject.getObject().position.y -= 0.1;
        this.globalSelectedObject.getObject();
        this.globalObjectInstance.render = true;
    });

     //if ctrl + s is pressed, save the model
    Mousetrap.bind('ctrl+s', (e) => {
      e.preventDefault();
      console.log('ctrl+s pressed');
      this.eventAggregator.publish('ctrlPlusSPressed', {});
    });
   

  }
}
