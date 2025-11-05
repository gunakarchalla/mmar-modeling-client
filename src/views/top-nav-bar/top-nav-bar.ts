import { bindable, EventAggregator } from "aurelia";
import { DialogHelper } from "resources/dialog_helper";
import { InstanceUtility } from "resources/services/instance_utility";

export class TopNavBar {

   @bindable dialogSaveAs = null;

   constructor(
      //used directly in html
      private dialogHelper: DialogHelper,
      private eventAggregator: EventAggregator,
      private instanceUtility: InstanceUtility
   ) { }

   attached() {
      this.eventAggregator.subscribe("ctrlPlusSPressed", async () => {
         this.dialogHelper.openDialog(this.dialogSaveAs, "openDialogSaveAs", {});
      });

      // update state initially and when tabs change
      this.updateUrdfMenuState();
      this.eventAggregator.subscribe('tabChanged', async () => {
         this.updateUrdfMenuState();
      });
   }

   // keep a reference to allow toggling disabled dynamically
   private urdfMenuItem = {
      label: "Upload URDF",
      icon: "upload",
      disabled: true,
      dialogName: "dialogUploadUrdf",
      eventPropagationName: "openDialogUploadUrdf"
   };

   fileMenu = {
      name: "File",
      icon: "folder",
      items: [
         {
            label: "Save Model",
            icon: "save",
            disabled: false,
            dialogName: "dialogSaveAs",
            eventPropagationName: "openDialogSaveAs"
         },
         {
            label: "Export Model as .json",
            icon: "folder_special",
            disabled: false
         },
         {
            label: "Import Model",
            icon: "upload",
            disabled: false,
            dialogName: "dialogImportModel",
            eventPropagationName: "openDialogImportModel"
         },
         this.urdfMenuItem,
         {
            label: "Import Metamodel",
            icon: "upload",
            disabled: false,
            dialogName: "dialogImportMetamodel",
            eventPropagationName: "openDialogImportMetamodel"
         },
         {
            label: "Export Open Models",
            icon: "folder_special",
            disabled: false
         }
      ],
      open: true
   };

   viewMenu = {
      name: "View",
      icon: "visibility",
      items: [
         {
            label: "Zoom In",
            icon: "zoom_in",
            disabled: true
         },
         {
            label: "Zoom Out",
            icon: "zoom_out",
            disabled: true
         },
         {
            label: "Zoom to Fit",
            icon: "zoom_out_map",
            disabled: true
         },
         {
            label: "Zoom to Selection",
            icon: "center_focus_strong",
            disabled: true
         }
      ],
      open: false
   }


   editMenu =
      {
         name: "Edit",
         icon: "edit",
         items: [
            {
               label: "Undo",
               icon: "undo",
               disabled: true
            },
            {
               label: "Redo",
               icon: "redo",
               disabled: true
            },
            {
               label: "Copy",
               icon: "file_copy",
               disabled: true
            },
            {
               label: "Paste",
               icon: "content_paste",
               disabled: true
            },
            {
               label: "Cut",
               icon: "content_cut",
               disabled: true
            }
         ],
         open: false
      };

   diagramMenu = {
      name: "Diagram",
      icon: "schema",
      items: [
         {
            label: "Check Rule Current Object",
            icon: "rule",
            disabled: true
         },
         {
            label: "Check Rule For Model",
            icon: "rule_folder",
            disabled: true
         },
         {
            label: "...",
            icon: "folder",
            disabled: true
         },
      ],
      open: false
   };

   settingsMenu = {
      name: "Settings",
      icon: "settings",
      items: [
         {
            label: "Open Settings",
            icon: "toggle_on",
            disabled: true
         },
      ],
      open: false
   };

   simulationMenu = {
      name: "Simulation",
      icon: "play_circle",
      open: false,
      items: [
         {
            label: "Enter Simulation Mode",
            icon: "play_arrow",
            disabled: false
         },
         {
            label: "Exit Simulation Mode",
            icon: "stop",
            disabled: false
         }
      ]
   }


   // Enable/disable URDF upload based on current scene type
   async updateUrdfMenuState() {
      try {
         const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
         const targetSceneTypeUuid = "c1d349d1-094f-4454-8b3c-88f5dc6db133";
         const enabled = !!sceneInstance && sceneInstance.uuid_scene_type === targetSceneTypeUuid;
         this.urdfMenuItem.disabled = !enabled;
      } catch (e) {
         // if anything goes wrong, keep it disabled
         this.urdfMenuItem.disabled = true;
      }
   }
}
