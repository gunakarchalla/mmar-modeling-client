import { bindable, customElement } from 'aurelia';
import { DialogHelper } from 'resources/dialog_helper';
import { PersistencyHandler } from 'resources/persistency_handler';

@customElement('menu-entry')
export class MenuEntry {


   marginTop = '0';
   marginBottom = '0';
   marginLeft = '0';
   marginRight = '0';
   anchorCorner = 'BOTTOM_LEFT';
   anchorCorner2 = 'BOTTOM_LEFT';
   anchorCorner3 = 'BOTTOM_LEFT';
   anchorCorner4 = 'BOTTOM_LEFT';
   anchorCorner5 = 'BOTTOM_LEFT';
   private dialog = null;

   lastSelection: number;

   @bindable menuEntry: object = {};
   @bindable dialogSaveAs = null;
   @bindable dialogImportModel = null;

   constructor(
      private dialogHelper: DialogHelper,
      private persistencyHandler: PersistencyHandler
   ) {
   }


   onMenuSelect(event: { index: number; item: string }) {
      this.lastSelection = event.index;
   }

   menuButtonClicked(item) {
      item.open = !item.open;
      this.menuEntry["open"] = item.open;
   }

   //logic to do the right thing for each menu entry
   async onItemClick(item) {

      // generic entries...----------------------------------------------------
      if (item.dialogName && item.eventPropagationName) {
         //call this with the item.eventPropagationName to open the dialog
         this.dialogHelper.openDialog(this[item.dialogName], item.eventPropagationName, {});
      }
      else if (item.dialogName) {
         //call this with the item.eventPropagationName to open the dialog
         this.dialogHelper.openDialog(this[item.dialogName], "", {});
      }

      // specific entries...----------------------------------------------------
      if (item.label === "Export Model as .json") {
         this.persistencyHandler.saveToTextfile();
      }

      if (item.label === "Export Open Models") {
         await this.persistencyHandler.saveAllOpenModelInstancesToTextfile();
      }
   }
}