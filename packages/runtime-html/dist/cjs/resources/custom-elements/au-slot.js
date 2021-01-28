"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuSlotsInfo = exports.IAuSlotsInfo = exports.AuSlot = exports.ProjectionProvider = exports.IProjectionProvider = exports.RegisteredProjections = exports.ProjectionContext = exports.SlotInfo = exports.AuSlotContentType = exports.IProjections = void 0;
const kernel_1 = require("@aurelia/kernel");
const dom_js_1 = require("../../dom.js");
const view_js_1 = require("../../templating/view.js");
const custom_element_js_1 = require("../custom-element.js");
exports.IProjections = kernel_1.DI.createInterface("IProjections");
var AuSlotContentType;
(function (AuSlotContentType) {
    AuSlotContentType[AuSlotContentType["Projection"] = 0] = "Projection";
    AuSlotContentType[AuSlotContentType["Fallback"] = 1] = "Fallback";
})(AuSlotContentType = exports.AuSlotContentType || (exports.AuSlotContentType = {}));
class SlotInfo {
    constructor(name, type, projectionContext) {
        this.name = name;
        this.type = type;
        this.projectionContext = projectionContext;
    }
}
exports.SlotInfo = SlotInfo;
class ProjectionContext {
    constructor(content, scope = null) {
        this.content = content;
        this.scope = scope;
    }
}
exports.ProjectionContext = ProjectionContext;
class RegisteredProjections {
    constructor(scope, projections) {
        this.scope = scope;
        this.projections = projections;
    }
}
exports.RegisteredProjections = RegisteredProjections;
exports.IProjectionProvider = kernel_1.DI.createInterface('IProjectionProvider', x => x.singleton(ProjectionProvider));
const projectionMap = new WeakMap();
class ProjectionProvider {
    registerProjections(projections, scope) {
        for (const [instruction, $projections] of projections) {
            projectionMap.set(instruction, new RegisteredProjections(scope, $projections));
        }
    }
    getProjectionFor(instruction) {
        return projectionMap.get(instruction) ?? null;
    }
}
exports.ProjectionProvider = ProjectionProvider;
class AuSlot {
    constructor(factory, location) {
        this.hostScope = null;
        this.view = factory.create().setLocation(location);
        this.isProjection = factory.contentType === AuSlotContentType.Projection;
        this.outerScope = factory.projectionScope;
    }
    /**
     * @internal
     */
    static get inject() { return [view_js_1.IViewFactory, dom_js_1.IRenderLocation]; }
    binding(_initiator, _parent, _flags) {
        this.hostScope = this.$controller.scope.parentScope;
    }
    attaching(initiator, parent, flags) {
        const { $controller } = this;
        return this.view.activate(initiator, $controller, flags, this.outerScope ?? this.hostScope, this.hostScope);
    }
    detaching(initiator, parent, flags) {
        return this.view.deactivate(initiator, this.$controller, flags);
    }
    dispose() {
        this.view.dispose();
        this.view = (void 0);
    }
    accept(visitor) {
        if (this.view?.accept(visitor) === true) {
            return true;
        }
    }
}
exports.AuSlot = AuSlot;
custom_element_js_1.customElement({ name: 'au-slot', template: null, containerless: true })(AuSlot);
exports.IAuSlotsInfo = kernel_1.DI.createInterface('AuSlotsInfo');
class AuSlotsInfo {
    /**
     * @param {string[]} projectedSlots - Name of the slots to which content are projected.
     */
    constructor(projectedSlots) {
        this.projectedSlots = projectedSlots;
    }
}
exports.AuSlotsInfo = AuSlotsInfo;
//# sourceMappingURL=au-slot.js.map