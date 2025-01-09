import { Initiator } from "resources/initiator";
import { Logger } from "resources/services/logger";

export class MyApp {

    constructor(
        private initiator: Initiator,
        private logger: Logger,
    ) {

    }

    async attached() {
        this.logger.log('init app', 'info');
        await this.initiator.init();
        await this.initiator.initEventListeners();
    }

}
