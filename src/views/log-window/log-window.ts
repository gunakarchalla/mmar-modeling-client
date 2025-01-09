import { Logger } from "resources/services/logger";

export class LogWindow{
    constructor(
        // used for html view
        private logger: Logger
    ){    }

    getTime(){
        const date = new Date();
        const time = date.toLocaleTimeString();
        return time;
    }

    //scrolls to bottom of log window
    updateScroll(element){
        element.scrollTop = 100000;
        return '';
    }
}