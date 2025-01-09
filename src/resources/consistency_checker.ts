import { Logger } from './services/logger';

import { inject } from 'aurelia';
import { Relationclass, ClassInstance, PortInstance, RoleInstance, Role } from '../../../mmar-global-data-structure';
import { GlobalDefinition } from "./global_definitions";
import Notiflix from "notiflix";




@inject(GlobalDefinition)
export class ConsistencyChecker {

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private logger: Logger
    ) { }


    checkStartPoint(relationclass: Relationclass, classInstance?: ClassInstance, portInstance?: PortInstance) {
        const role_from = relationclass.role_from;
        let allowed_class_reference;
        let allowed_port_reference;
        let allowed = true;


        //if classInstance provided
        if (classInstance) {
            allowed_class_reference = role_from.class_references.find(class_reference => class_reference.uuid == classInstance.uuid_class);
            if (allowed_class_reference) allowed = this.countSameRelationsOnClassInstance(this.globalObjectInstance.role_instances, role_from, relationclass, classInstance, allowed_class_reference.min, allowed_class_reference.max);
        }

        //if portInstance provided
        if (portInstance) {
            allowed_port_reference = role_from.port_references.find(port_reference => port_reference.uuid == portInstance.uuid_port);
            if (allowed_port_reference) allowed = this.countSameRelationsOnPortInstance(this.globalObjectInstance.role_instances, role_from, relationclass, portInstance, allowed_port_reference.min, allowed_port_reference.max);
        }


        if (!allowed_class_reference && !allowed_port_reference) {
            allowed = false;
            Notiflix.Notify.failure('This action is not allowed due to some restirctions in the metamodel!');

            //push to log file
            this.logger.log('This action is not allowed due to some restirctions in the metamodel!', 'close');

            return allowed;
        }


        if (!allowed) {
            Notiflix.Notify.failure('This action is not allowed due to some restirctions in the metamodel!');
            //push to log file     
            this.logger.log('This action is not allowed due to some restirctions in the metamodel!', 'close');
        }
        return allowed;
    }

    checkEndPoint(relationclass: Relationclass, classInstance?: ClassInstance, portInstance?: PortInstance) {
        const role_to = relationclass.role_to;
        let allowed_class_reference;
        let allowed_port_reference;
        let allowed = true;

        //if classInstance provided
        if (classInstance) {
            allowed_class_reference = role_to.class_references.find(class_reference => class_reference.uuid == classInstance.uuid_class);
            if (allowed_class_reference) allowed = this.countSameRelationsOnClassInstance(this.globalObjectInstance.role_instances, role_to, relationclass, classInstance, allowed_class_reference.min, allowed_class_reference.max);
        }

        //if portInstance provided
        if (portInstance) {
            allowed_port_reference = role_to.port_references.find(port_reference => port_reference.uuid == portInstance.uuid_port);
            if (allowed_port_reference) allowed = this.countSameRelationsOnPortInstance(this.globalObjectInstance.role_instances, role_to, relationclass, portInstance, allowed_port_reference.min, allowed_port_reference.max);
        }


        if (!allowed_class_reference && !allowed_port_reference) {
            allowed = false;
            Notiflix.Notify.failure('This action is not allowed due to some restirctions in the metamodel!');
            //push to log file
            this.logger.log('This action is not allowed due to some restirctions in the metamodel!', 'close');
            return allowed;
        }


        if (!allowed) {
            Notiflix.Notify.failure('This action is not allowed due to some restirctions in the metamodel!');
            //push to log file
            this.logger.log('This action is not allowed due to some restirctions in the metamodel!', 'close');
        }
        return allowed;
    }

    countSameRelationsOnClassInstance(roleInstances: RoleInstance[], roleToCheck: Role, relationclass: Relationclass, classInstance: ClassInstance, min: number, max: number) {
        const roleInstancesFound = roleInstances.filter(roleInstance =>
            roleInstance.uuid_role == roleToCheck.uuid &&
            // roleInstance.uuid_relationclass == relationclass.uuid &&
            roleInstance.uuid_has_reference_class_instance == classInstance.uuid
        );

        // push to log file
        this.logger.log('role consistency check: min is: ' + min + ' and max is: ' + max, 'info');

        if ((min <= roleInstancesFound.length + 1 || min == null) && (roleInstancesFound.length + 1 <= max || max == null)) {

            // push to log file
            this.logger.log('role allowed!', 'done');

            return true;
        }
        else {
            // push to log file
            this.logger.log('role not allowed!', 'close');

            return false;
        }
    }

    countSameRelationsOnPortInstance(roleInstances: RoleInstance[], roleToCheck: Role, relationclass: Relationclass, portInstance: PortInstance, min: number, max: number) {
        const roleInstancesFound = roleInstances.filter(roleInstance =>
            roleInstance.uuid_role == roleToCheck.uuid &&
            //roleInstance.uuid_relationclass == relationclass.uuid &&
            roleInstance.uuid_has_reference_port_instance == portInstance.uuid);

        // push to log file
        this.logger.log('role consistency check: min is: ' + min + ' and max is: ' + max, 'info');

        if ((min <= roleInstancesFound.length + 1 || min == null) && (roleInstancesFound.length + 1 <= max || max == null)) {

            // push to log file
            this.logger.log('role allowed!', 'done');

            return true;
        }
        else {

            // push to log file
            this.logger.log('role not allowed!', 'close');

            return false;
        }
    }

}
