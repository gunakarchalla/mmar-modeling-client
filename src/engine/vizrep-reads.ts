import type { ObjectInstance, UUID } from "@gds";

/**
 * What each instance's vizRep read the last time it ran, so a change redraws exactly
 * the instances that read what changed.
 *
 * A vizRep reaches the model only through `gc.expression`. While it runs,
 * `GraphicContext.runVizRepFunction` hands it a stand-in for that object (`tracking`)
 * which notes every read before passing the call on. The stand-in belongs to that one run,
 * so a mechanism calling the expression API at the same moment is not mistaken for part
 * of the drawing. When the run ends, what it read replaces what the instance's previous
 * run read: a vizRep that reads something only under some condition is followed as the
 * condition changes.
 *
 * A read is recorded as a key naming the data, not the call:
 * - an attribute of an instance, by meta attribute uuid or by meta attribute name, as
 *   the call named it (a table's cells count as its attribute);
 * - the relations an instance has at either end.
 *
 * Not recorded, so not followed: which instances of a class exist
 * (`getClassInstancesByMetaUUID`), and what a vizRep reads straight off an instance
 * object it was handed (its `name`, say) rather than through a call.
 */

export type ReadKey = string;

export const readKeys = {
  attribute: (instanceUuid: UUID, metaAttributeUuid: UUID): ReadKey => `attribute|${instanceUuid}|${metaAttributeUuid}`,
  attributeNamed: (instanceUuid: UUID, metaAttributeName: string): ReadKey => `named|${instanceUuid}|${metaAttributeName}`,
  relations: (instanceUuid: UUID): ReadKey => `relations|${instanceUuid}`,
};

const text = (value: unknown) => String(value);

/**
 * The keys an expression call reads, by method name. `self` is the instance being drawn,
 * which is whom `attrval` and `attrvalByName` read from. Methods not listed read nothing
 * that is followed, or write.
 */
const READS: Record<string, (self: UUID, args: unknown[]) => ReadKey[]> = {
  attrval: (self, [attribute]) => [readKeys.attribute(self, text(attribute))],
  attrvalByName: (self, [name]) => [readKeys.attributeNamed(self, text(name))],
  attrvalByInst: (_self, [attribute, instance]) => [readKeys.attribute(text(instance), text(attribute))],
  attrvalByNameAndInst: (_self, [name, instance]) => [readKeys.attributeNamed(text(instance), text(name))],
  getAttrByInstanceUUID: (_self, [instance, attribute]) => [readKeys.attribute(text(instance), text(attribute))],
  getTableRows: (_self, [instance, attribute]) => [readKeys.attribute(text(instance), text(attribute))],
  getIncomingRelationsByInstanceUUID: (_self, [instance]) => [readKeys.relations(text(instance))],
  getOutgoingRelationsByInstanceUUID: (_self, [instance]) => [readKeys.relations(text(instance))],
  getSourcesByInstanceUUID: (_self, [instance]) => [readKeys.relations(text(instance))],
  getDestinationsByInstanceUUID: (_self, [instance]) => [readKeys.relations(text(instance))],
  isConnected: (_self, [instance]) => [readKeys.relations(text(instance))],
};

/** One vizRep run under way: the stand-in to draw with, and the call that ends the run. */
export interface TrackedRun<T> {
  expression: T;
  done(): void;
}

export class VizRepReads {
  private readsOf = new Map<UUID, Set<ReadKey>>();
  private readersOf = new Map<ReadKey, Set<UUID>>();

  /**
   * A stand-in for `expression` that records what the vizRep of `instance` reads, and
   * answers `self()` with `instance`. Reads made after `done()` are not recorded: a
   * vizRep can leave a call running past its end.
   */
  tracking<T extends object>(expression: T, instance: ObjectInstance): TrackedRun<T> {
    const keys = new Set<ReadKey>();
    let open = true;
    const stand_in = new Proxy(expression, {
      get(target, property) {
        if (property === "self") return async () => instance;
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        const reads = typeof property === "string" ? READS[property] : undefined;
        return (...args: unknown[]) => {
          if (open && reads) for (const key of reads(instance.uuid, args)) keys.add(key);
          return value.apply(target, args);
        };
      },
    });
    return {
      expression: stand_in,
      done: () => {
        if (!open) return;
        open = false;
        this.record(instance.uuid, keys);
      },
    };
  }

  /** Whether `instanceUuid`'s vizRep has run under tracking since it was last forgotten. */
  hasRecord(instanceUuid: UUID): boolean {
    return this.readsOf.has(instanceUuid);
  }

  /** The instances whose last vizRep run read any of `keys`. */
  readers(keys: Iterable<ReadKey>): Set<UUID> {
    const readers = new Set<UUID>();
    for (const key of keys) {
      for (const reader of this.readersOf.get(key) ?? []) readers.add(reader);
    }
    return readers;
  }

  /** Drop what is known about `instanceUuid`, which is no longer drawn. */
  forget(instanceUuid: UUID): void {
    for (const key of this.readsOf.get(instanceUuid) ?? []) {
      const readers = this.readersOf.get(key);
      readers?.delete(instanceUuid);
      if (readers?.size === 0) this.readersOf.delete(key);
    }
    this.readsOf.delete(instanceUuid);
  }

  /** Forget everything: the session ended. */
  clear(): void {
    this.readsOf.clear();
    this.readersOf.clear();
  }

  private record(instanceUuid: UUID, keys: Set<ReadKey>): void {
    this.forget(instanceUuid);
    this.readsOf.set(instanceUuid, keys);
    for (const key of keys) {
      let readers = this.readersOf.get(key);
      if (!readers) this.readersOf.set(key, (readers = new Set()));
      readers.add(instanceUuid);
    }
  }
}

// Module singleton — one shared instance.
export const vizRepReads = new VizRepReads();
