import { GlobalStateObject } from 'resources/global_state_object';

export class DialogUserInfo{

    selectionMode = 'SelectionMode (drag)';
    viewMode = 'ViewMode';
    drawingMode = 'DrawingMode (insert)';
    drawingModeRelationClass = 'DrawingModeRelationClass (line)';
    simulationMode = 'SimulationMode';

    
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