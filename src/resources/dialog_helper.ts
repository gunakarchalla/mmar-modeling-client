import { singleton } from 'aurelia';
import { EventAggregator } from 'aurelia';




@singleton()
export class DialogHelper {


  constructor(
    private eventAggregator: EventAggregator
  ) { }

  // Function to open a generic dialog
  // Parameters:
  // dialog - the dialog object to be opened
  // eventPropagation - the name of the event to be published
  // payload - the context to be passed along with the event
  async openDialog(dialog, eventPropagation, payload) {
    // Check if an eventPropagation name is provided
    if (eventPropagation !== "") {
      // Publish the event with the provided payload
      this.eventAggregator.publish(eventPropagation, payload);
    }
    // Open the dialog
    dialog.open();
  }
}