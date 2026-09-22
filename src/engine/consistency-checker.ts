import { Relationclass, ClassInstance, PortInstance, RoleInstance, Role } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { logger } from "@/resources/services/logger";
import { reportMetamodelViolation } from "@/resources/services/metamodel-constraints";

/**
 * Guards relation drawing against the metamodel.
 *
 * Before a relation is created its two ends are checked here: the picked class (or
 * port) must be listed as a reference on the role for that end, and adding one more
 * relation must not push the number of role instances already on that object outside
 * the reference's min/max. Both ends run the same check against a different role —
 * `role_from` for the start point, `role_to` for the end point.
 *
 * A rejection is reported twice on purpose: once at "error" level, which the logger
 * surfaces as a snackbar the user sees, and once at "close" level for the log window.
 */
export class ConsistencyChecker {
  private globalObjectInstance = globalObject;
  private logger = logger;

  /** Checks the object the user started the relation on against `role_from`. */
  checkStartPoint(relationclass: Relationclass, classInstance?: ClassInstance, portInstance?: PortInstance) {
    return this.checkRole(relationclass.role_from, classInstance, portInstance);
  }

  /** Checks the object the user ended the relation on against `role_to`. */
  checkEndPoint(relationclass: Relationclass, classInstance?: ClassInstance, portInstance?: PortInstance) {
    return this.checkRole(relationclass.role_to, classInstance, portInstance);
  }

  /**
   * Exactly one of `classInstance` / `portInstance` is set — whichever kind of object
   * the ray hit. A relation end is allowed when the role references that object's meta
   * class / port AND the cardinality of that reference still has room.
   */
  private checkRole(role: Role, classInstance?: ClassInstance, portInstance?: PortInstance): boolean {
    let allowed = true;
    let reference;

    if (classInstance) {
      reference = role.class_references.find((class_reference) => class_reference.uuid == classInstance.uuid_class);
      if (reference) {
        allowed = this.countSameRelationsOnClassInstance(this.globalObjectInstance.role_instances, role, classInstance, reference.min, reference.max);
      }
    } else if (portInstance) {
      reference = role.port_references.find((port_reference) => port_reference.uuid == portInstance.uuid_port);
      if (reference) {
        allowed = this.countSameRelationsOnPortInstance(this.globalObjectInstance.role_instances, role, portInstance, reference.min, reference.max);
      }
    }

    // No reference at all means the metamodel does not connect this role to this kind
    // of object — a stricter rejection than running out of cardinality, same message.
    if (!reference) allowed = false;
    if (!allowed) this.rejectAction();
    return allowed;
  }

  /** Report a rejected relation to the user (snackbar) and to the log window. */
  private rejectAction(): void {
    reportMetamodelViolation();
  }

  countSameRelationsOnClassInstance(roleInstances: RoleInstance[], roleToCheck: Role, classInstance: ClassInstance, min: number, max: number) {
    return this.fitsCardinality(
      roleInstances.filter((roleInstance) => roleInstance.uuid_role == roleToCheck.uuid && roleInstance.uuid_has_reference_class_instance == classInstance.uuid).length,
      min,
      max,
    );
  }

  countSameRelationsOnPortInstance(roleInstances: RoleInstance[], roleToCheck: Role, portInstance: PortInstance, min: number, max: number) {
    return this.fitsCardinality(
      roleInstances.filter((roleInstance) => roleInstance.uuid_role == roleToCheck.uuid && roleInstance.uuid_has_reference_port_instance == portInstance.uuid).length,
      min,
      max,
    );
  }

  /**
   * Would one more role instance still satisfy the reference's cardinality? `existing`
   * counts the role instances already on the object, hence the `+ 1`. A null bound is
   * treated as unbounded.
   */
  private fitsCardinality(existing: number, min: number, max: number): boolean {
    this.logger.log("role consistency check: min is: " + min + " and max is: " + max, "info");

    const withNewRole = existing + 1;
    const allowed = (min <= withNewRole || min == null) && (withNewRole <= max || max == null);
    this.logger.log(allowed ? "role allowed!" : "role not allowed!", allowed ? "done" : "close");
    return allowed;
  }
}

// Module singleton — one shared instance.
export const consistencyChecker = new ConsistencyChecker();
