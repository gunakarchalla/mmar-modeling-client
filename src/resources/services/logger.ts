import { singleton } from "aurelia";

singleton()
export class Logger{

    logArray: {value: string, status: string}[] = [];   

    log(value: string, status: string){
        this.logArray.unshift(
            {
                value: value,
                status: status
            });
    }
}