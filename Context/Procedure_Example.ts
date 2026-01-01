async function fireTransitions(expression){
 
    function delay(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }
    const transitions = await expression.getClassInstancesByMetaUUID("123bd2cf-c79d-4e31-88e5-c71ee559535b");
 
    async function isConnected(transition){
        const oldIncomingArcsValue = await expression.attrvalByInst("8de345ad-c636-48ad-a53d-df5836b135cd", transition.uuid);
        const oldOutgoingArcsValue = await expression.attrvalByInst("e72a4720-4cf9-412f-ab6b-dddf27b6d435", transition.uuid);
        const incomingArcs = await expression.getIncomingRelationsByInstanceUUID(transition.uuid,"1bab6460-3aea-46b2-89e5-c436e3e194c5");
        const outgoingArcs = await expression.getOutgoingRelationsByInstanceUUID(transition.uuid, "1bab6460-3aea-46b2-89e5-c436e3e194c5");
        const newIncomingArcsValue = incomingArcs.length != 0 ? "true" : "false";
        const newOutgoingArcsValue = outgoingArcs.length != 0 ? "true" : "false";
        if (oldIncomingArcsValue!==newIncomingArcsValue) {
            await expression.setAttrvalByInstanceUUID(transition.uuid, "8de345ad-c636-48ad-a53d-df5836b135cd", newIncomingArcsValue);
            await expression.checkForVisualizationUpdateByAttributeUUID(transition.uuid, "8de345ad-c636-48ad-a53d-df5836b135cd");
        }
        if (oldOutgoingArcsValue!==newOutgoingArcsValue) {
            await expression.setAttrvalByInstanceUUID(transition.uuid, "e72a4720-4cf9-412f-ab6b-dddf27b6d435", newOutgoingArcsValue);
            await expression.checkForVisualizationUpdateByAttributeUUID(transition.uuid, "e72a4720-4cf9-412f-ab6b-dddf27b6d435");
        }
        return newIncomingArcsValue === "true" && newOutgoingArcsValue === "true";
    }

    async function isFireable(transition){
        const oldEnoughTokensValue = await expression.attrvalByInst("7524cc99-82e0-4ca4-b752-10c21f7b0f57", transition.uuid);

        let fireable = await isConnected(transition);
        if (fireable){
            const incomingArcs = await expression.getIncomingRelationsByInstanceUUID(transition.uuid, "1bab6460-3aea-46b2-89e5-c436e3e194c5");
            for (let arc of incomingArcs){
                let incomingPlace = await expression.getSourceByRelInstanceUUID(arc.uuid);
                let weight = parseInt(await expression.attrvalByInst("9e68a132-3d72-4af2-8d0e-b238af904a29", arc.uuid)) || 1;
                let tokens = parseInt(await expression.attrvalByInst("e4943c7e-e6f0-4f0f-b26b-7860416a7c63", incomingPlace.uuid)) || 0;
                if (tokens < weight){
                fireable = false; 
                break;  
                }
            }
        }
        const newEnoughTokensValue = fireable? "true": "false";
        if (oldEnoughTokensValue!==newEnoughTokensValue){
            await expression.setAttrvalByInstanceUUID(transition.uuid, "7524cc99-82e0-4ca4-b752-10c21f7b0f57", newEnoughTokensValue);
            await expression.checkForVisualizationUpdateByAttributeUUID(transition.uuid, "7524cc99-82e0-4ca4-b752-10c21f7b0f57");
            await delay(400);
        }
        return fireable; 
    }

    async function fireTransition(transition){
        if (await isFireable(transition)){
            const incomingArcs = await expression.getIncomingRelationsByInstanceUUID(transition.uuid,"1bab6460-3aea-46b2-89e5-c436e3e194c5");
            const outgoingArcs = await expression.getOutgoingRelationsByInstanceUUID(transition.uuid, "1bab6460-3aea-46b2-89e5-c436e3e194c5");
            for (let arc of incomingArcs){
                let incomingPlace = await expression.getSourceByRelInstanceUUID(arc.uuid);
                let weight = parseInt(await expression.attrvalByInst("9e68a132-3d72-4af2-8d0e-b238af904a29", arc.uuid)) || 1;
                let tokensAttribute = await expression.getAttrByInstanceUUID(incomingPlace.uuid, "e4943c7e-e6f0-4f0f-b26b-7860416a7c63");
                let tokens = parseInt(tokensAttribute?.value) || 0;
                tokensAttribute.value = (tokens-weight).toString();

                await expression.checkForVisualizationUpdateByAttributeUUID(incomingPlace.uuid, "e4943c7e-e6f0-4f0f-b26b-7860416a7c63");
                await delay(400);
            }
            for (let arc of outgoingArcs){
                let outgoingPlace = await expression.getDestinationByRelInstanceUUID(arc.uuid);
                let weight = parseInt(await expression.attrvalByInst("9e68a132-3d72-4af2-8d0e-b238af904a29", arc.uuid)) || 1;
                let tokensAttribute = await expression.getAttrByInstanceUUID(outgoingPlace.uuid, "e4943c7e-e6f0-4f0f-b26b-7860416a7c63");
                let tokens = parseInt(tokensAttribute?.value) || 0;
                tokensAttribute.value = (tokens+weight).toString();

                await expression.checkForVisualizationUpdateByAttributeUUID(outgoingPlace.uuid, "e4943c7e-e6f0-4f0f-b26b-7860416a7c63");
                await delay(400);
            }
            return true; 
        }
        return false; 
    }

    async function simulate(transitions){
        let hasFired = true; 
        while (hasFired){
            hasFired = false; 
            for (let transition of transitions){
                if (await fireTransition(transition)){
                    hasFired = true; 
                }
            }
        }
    }

    await simulate(transitions);
 
}