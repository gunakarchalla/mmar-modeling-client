/**
 * UUIDs of concrete metamodel objects the modeling client's behaviour depends on.
 *
 * These are contracts with the DATABASE, not arbitrary constants: each one identifies a
 * row of the demo metamodel. They live here rather than inline at their use sites so the
 * mapping stays greppable — do not regenerate or "tidy" them.
 */

/**
 * AttributeType "File". Attribute instances whose meta attribute has this type get
 * the upload / delete / download buttons in the attribute window.
 *
 * NOTE: no attribute of this type exists in the demo metamodel, so that branch is
 * unreachable with demo data; the file endpoints themselves are covered by an
 * integration test.
 */
export const FILE_ATTRIBUTE_TYPE_UUID = "2df15b5e-6b43-4911-b38b-0fc5747a8ee6";

/**
 * The meta Attribute "Object 3D" — rendered as a glTF upload button instead of a text
 * field. Present on ObjectSpace's Detectable and Augmentation classes.
 */
export const OBJECT_3D_ATTRIBUTE_UUID = "b058b3b4-b523-4ffe-b08e-4f8dda2831c8";

/**
 * The meta Attribute "Image to detect" — rendered as an image upload button. Also on
 * ObjectSpace's Detectable / Augmentation classes.
 */
export const IMAGE_TO_DETECT_ATTRIBUTE_UUID = "d334dd62-5651-4d0f-a7a0-13718f20da36";

/**
 * The meta Attribute "Name". The reference dialog resolves a referenced instance's
 * display name through this attribute.
 */
export const NAME_ATTRIBUTE_UUID = "d6632c72-89fa-4210-9d01-18e911505608";

/**
 * SceneType "Robotic system" — the table dialog and the simulation window run the
 * robotics algorithms only for scenes of this type.
 */
export const ROBOTIC_SYSTEM_SCENETYPE_UUID = "113c3133-bf77-493a-a36f-553e77832280";

/**
 * Sentinel default values. The upload buttons flip their label ("Upload" vs "Replace")
 * by comparing the attribute value against the meta default, rather than by checking
 * whether real content is present.
 */
export const OBJECT_3D_DEFAULT_VALUE = "3D Object String";
export const IMAGE_DEFAULT_VALUE = "Image";

/* ------------------------------------------------------------------------- *
 * Hybrid algorithms + simulation window.
 * ------------------------------------------------------------------------- */

/** SceneType "ObjectSpace" — gates the augmentation / detectable algorithms. */
export const OBJECTSPACE_SCENETYPE_UUID = "a3b35b86-2636-4987-8cc4-814f468f6c4b";

/** SceneType "Statechange" — gates the reference algorithm. */
export const STATECHANGE_SCENETYPE_UUID = "239c5597-6cc9-498a-bf61-432cf85b3835";

/**
 * AttributeType "Mechanism". An attribute of this type holds a function body that the
 * animator runs on every render tick while `globalObject.runMechanism` is set.
 */
export const MECHANISM_ATTRIBUTE_TYPE_UUID = "a8e33bad-9eed-4a24-a4b2-406c5439d13a";

/** Class "Joint" of the Robotic system metamodel — one slider per instance. */
export const META_JOINT_UUID = "c5cf9a3c-988a-4fd4-87e5-0ad8fcc7234b";

/** Class "Reference" of the Statechange metamodel. */
export const REFERENCE_CLASS_UUID = "ada138a9-646c-4df4-8622-fb79092a9ad0";

/** Attribute "Augmentation_Reference" on the Statechange Reference class. */
export const AUGMENTATION_REFERENCE_ATTRIBUTE_UUID = "b8d05324-ed3b-4c10-885a-164ec15a0f36";

/** Attribute "size in meters" on the ObjectSpace Detectable class. */
export const SIZE_IN_METERS_ATTRIBUTE_UUID = "c1d9b467-08d8-4350-aa62-a47d6939b6ec";

/**
 * The Reference class's pose attributes. `updateReferenceClassAttributeInstanceValues`
 * writes the three.js object's pose into them once a second (the canvas heartbeat) and
 * `updateThreejsObject` reads them back — but only while the corresponding Set Position
 * / Set Rotation flag attribute holds the string "true".
 */
export const REFERENCE_POSITION_X_ATTRIBUTE_UUID = "5a038d67-bc1a-4881-86e8-f53f37dae5d6";
export const REFERENCE_POSITION_Y_ATTRIBUTE_UUID = "455eae8f-35c7-44f9-8909-468972f53341";
export const REFERENCE_POSITION_Z_ATTRIBUTE_UUID = "d84b02fd-3c04-4612-82f5-b7a1eb95a7c4";
export const REFERENCE_ROTATION_X_ATTRIBUTE_UUID = "21ae60ea-be54-432c-a7c5-c66085f098a8";
export const REFERENCE_ROTATION_Y_ATTRIBUTE_UUID = "35eaa212-71c2-4b15-8da9-4dc29be6b4e4";
export const REFERENCE_ROTATION_Z_ATTRIBUTE_UUID = "8a4d3bc4-3dfb-4145-983c-dafe42a4b26e";
export const REFERENCE_ROTATION_W_ATTRIBUTE_UUID = "e4e03c44-63e9-4d36-9304-a8fea5300cd3";
export const REFERENCE_SET_ROTATION_ATTRIBUTE_UUID = "3a5b4525-4616-49f5-a5b1-2f9f4d8ec483";
export const REFERENCE_SET_POSITION_ATTRIBUTE_UUID = "043daf98-2cdd-4b85-9e7a-8d983c43f565";
