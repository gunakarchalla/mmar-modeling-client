import { GlobalStateObject } from 'resources/global_state_object';

export class DialogUserInfo{

    selectionMode = 'SelectionMode (drag)';
    viewMode = 'ViewMode';
    drawingMode = 'DrawingMode (insert)';
    drawingModeRelationClass = 'DrawingModeRelationClass (line)';

    
    constructor(
        private globalStateObject: GlobalStateObject
    )
    {
    }

    cancel(){

    }

    reportProblem(){

    }
}