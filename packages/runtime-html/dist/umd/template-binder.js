/* eslint-disable compat/compat */
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "@aurelia/kernel", "@aurelia/runtime", "./semantic-model"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TemplateBinder = void 0;
    const kernel_1 = require("@aurelia/kernel");
    const runtime_1 = require("@aurelia/runtime");
    const semantic_model_1 = require("./semantic-model");
    const invalidSurrogateAttribute = Object.assign(Object.create(null), {
        'id': true,
        'au-slot': true,
    });
    const attributesToIgnore = Object.assign(Object.create(null), {
        'as-element': true,
    });
    function hasInlineBindings(rawValue) {
        const len = rawValue.length;
        let ch = 0;
        for (let i = 0; i < len; ++i) {
            ch = rawValue.charCodeAt(i);
            if (ch === 92 /* Backslash */) {
                ++i;
                // Ignore whatever comes next because it's escaped
            }
            else if (ch === 58 /* Colon */) {
                return true;
            }
            else if (ch === 36 /* Dollar */ && rawValue.charCodeAt(i + 1) === 123 /* OpenBrace */) {
                return false;
            }
        }
        return false;
    }
    function processInterpolationText(symbol) {
        const node = symbol.physicalNode;
        const parentNode = node.parentNode;
        while (node.nextSibling !== null && node.nextSibling.nodeType === 3 /* Text */) {
            parentNode.removeChild(node.nextSibling);
        }
        node.textContent = '';
        parentNode.insertBefore(symbol.marker, node);
    }
    function isTemplateControllerOf(proxy, manifest) {
        return proxy !== manifest;
    }
    /**
     * A (temporary) standalone function that purely does the DOM processing (lifting) related to template controllers.
     * It's a first refactoring step towards separating DOM parsing/binding from mutations.
     */
    function processTemplateControllers(dom, manifestProxy, manifest) {
        const manifestNode = manifest.physicalNode;
        let current = manifestProxy;
        let currentTemplate;
        while (isTemplateControllerOf(current, manifest)) {
            if (current.template === manifest) {
                // the DOM linkage is still in its original state here so we can safely assume the parentNode is non-null
                manifestNode.parentNode.replaceChild(current.marker, manifestNode);
                // if the manifest is a template element (e.g. <template repeat.for="...">) then we can skip one lift operation
                // and simply use the template directly, saving a bit of work
                if (manifestNode.nodeName === 'TEMPLATE') {
                    current.physicalNode = manifestNode;
                    // the template could safely stay without affecting anything visible, but let's keep the DOM tidy
                    manifestNode.remove();
                }
                else {
                    // the manifest is not a template element so we need to wrap it in one
                    currentTemplate = current.physicalNode = dom.createTemplate();
                    currentTemplate.content.appendChild(manifestNode);
                }
            }
            else {
                currentTemplate = current.physicalNode = dom.createTemplate();
                currentTemplate.content.appendChild(current.marker);
            }
            manifestNode.removeAttribute(current.syntax.rawName);
            current = current.template;
        }
    }
    /**
     * TemplateBinder. Todo: describe goal of this class
     */
    class TemplateBinder {
        constructor(dom, resources, attrParser, exprParser, attrSyntaxTransformer) {
            this.dom = dom;
            this.resources = resources;
            this.attrParser = attrParser;
            this.exprParser = exprParser;
            this.attrSyntaxTransformer = attrSyntaxTransformer;
        }
        bind(node) {
            const surrogate = new semantic_model_1.PlainElementSymbol(this.dom, node);
            const resources = this.resources;
            const attrSyntaxTransformer = this.attrSyntaxTransformer;
            const attributes = node.attributes;
            let i = 0;
            while (i < attributes.length) {
                const attr = attributes[i];
                const attrSyntax = this.attrParser.parse(attr.name, attr.value);
                if (invalidSurrogateAttribute[attrSyntax.target] === true) {
                    throw new Error(`Invalid surrogate attribute: ${attrSyntax.target}`);
                    // TODO: use reporter
                }
                const bindingCommand = resources.getBindingCommand(attrSyntax, true);
                if (bindingCommand === null || (bindingCommand.bindingType & 4096 /* IgnoreCustomAttr */) === 0) {
                    const attrInfo = resources.getAttributeInfo(attrSyntax);
                    if (attrInfo === null) {
                        // map special html attributes to their corresponding properties
                        attrSyntaxTransformer.transform(node, attrSyntax);
                        // it's not a custom attribute but might be a regular bound attribute or interpolation (it might also be nothing)
                        this.bindPlainAttribute(
                        /* attrSyntax */ attrSyntax, 
                        /* attr       */ attr, 
                        /* surrogate  */ surrogate, 
                        /* manifest   */ surrogate);
                    }
                    else if (attrInfo.isTemplateController) {
                        throw new Error('Cannot have template controller on surrogate element.');
                        // TODO: use reporter
                    }
                    else {
                        this.bindCustomAttribute(
                        /* attrSyntax */ attrSyntax, 
                        /* attrInfo   */ attrInfo, 
                        /* command    */ bindingCommand, 
                        /* manifest   */ surrogate);
                    }
                }
                else {
                    // map special html attributes to their corresponding properties
                    attrSyntaxTransformer.transform(node, attrSyntax);
                    // it's not a custom attribute but might be a regular bound attribute or interpolation (it might also be nothing)
                    this.bindPlainAttribute(
                    /* attrSyntax */ attrSyntax, 
                    /* attr       */ attr, 
                    /* surrogate  */ surrogate, 
                    /* manifest   */ surrogate);
                }
                ++i;
            }
            this.bindChildNodes(
            /* node               */ node, 
            /* surrogate          */ surrogate, 
            /* manifest           */ surrogate, 
            /* manifestRoot       */ null, 
            /* parentManifestRoot */ null);
            return surrogate;
        }
        bindManifest(parentManifest, node, surrogate, manifest, manifestRoot, parentManifestRoot) {
            var _a;
            let isAuSlot = false;
            switch (node.nodeName) {
                case 'LET':
                    // let cannot have children and has some different processing rules, so return early
                    this.bindLetElement(
                    /* parentManifest */ parentManifest, 
                    /* node           */ node);
                    return;
                case 'SLOT':
                    surrogate.hasSlots = true;
                    break;
                case 'AU-SLOT':
                    isAuSlot = true;
                    break;
            }
            let name = node.getAttribute('as-element');
            if (name === null) {
                name = node.nodeName.toLowerCase();
            }
            const elementInfo = this.resources.getElementInfo(name);
            if (elementInfo === null) {
                // there is no registered custom element with this name
                manifest = new semantic_model_1.PlainElementSymbol(this.dom, node);
            }
            else {
                // it's a custom element so we set the manifestRoot as well (for storing replaces)
                parentManifestRoot = manifestRoot;
                const ceSymbol = new semantic_model_1.CustomElementSymbol(this.dom, node, elementInfo);
                if (isAuSlot) {
                    ceSymbol.flags = 512 /* isAuSlot */;
                    ceSymbol.slotName = (_a = node.getAttribute("name")) !== null && _a !== void 0 ? _a : "default";
                }
                manifestRoot = manifest = ceSymbol;
            }
            // lifting operations done by template controllers and replaces effectively unlink the nodes, so start at the bottom
            this.bindChildNodes(
            /* node               */ node, 
            /* surrogate          */ surrogate, 
            /* manifest           */ manifest, 
            /* manifestRoot       */ manifestRoot, 
            /* parentManifestRoot */ parentManifestRoot);
            // the parentManifest will receive either the direct child nodes, or the template controllers / replaces
            // wrapping them
            this.bindAttributes(
            /* node               */ node, 
            /* parentManifest     */ parentManifest, 
            /* surrogate          */ surrogate, 
            /* manifest           */ manifest, 
            /* manifestRoot       */ manifestRoot, 
            /* parentManifestRoot */ parentManifestRoot);
            if (manifestRoot === manifest && manifest.isContainerless) {
                node.parentNode.replaceChild(manifest.marker, node);
            }
            else if (manifest.isTarget) {
                node.classList.add('au');
            }
        }
        bindLetElement(parentManifest, node) {
            const symbol = new semantic_model_1.LetElementSymbol(this.dom, node);
            parentManifest.childNodes.push(symbol);
            const attributes = node.attributes;
            let i = 0;
            while (i < attributes.length) {
                const attr = attributes[i];
                if (attr.name === 'to-binding-context') {
                    node.removeAttribute('to-binding-context');
                    symbol.toBindingContext = true;
                    continue;
                }
                const attrSyntax = this.attrParser.parse(attr.name, attr.value);
                const command = this.resources.getBindingCommand(attrSyntax, false);
                const bindingType = command === null ? 2048 /* Interpolation */ : command.bindingType;
                const expr = this.exprParser.parse(attrSyntax.rawValue, bindingType);
                const to = kernel_1.camelCase(attrSyntax.target);
                const info = new runtime_1.BindableInfo(to, runtime_1.BindingMode.toView);
                symbol.bindings.push(new semantic_model_1.BindingSymbol(command, info, expr, attrSyntax.rawValue, to));
                ++i;
            }
            node.parentNode.replaceChild(symbol.marker, node);
        }
        bindAttributes(node, parentManifest, surrogate, manifest, manifestRoot, parentManifestRoot) {
            var _a;
            // This is the top-level symbol for the current depth.
            // If there are no template controllers or replaces, it is always the manifest itself.
            // If there are template controllers, then this will be the outer-most TemplateControllerSymbol.
            let manifestProxy = manifest;
            let previousController = (void 0);
            let currentController = (void 0);
            const attributes = node.attributes;
            let i = 0;
            while (i < attributes.length) {
                const attr = attributes[i];
                ++i;
                if (attributesToIgnore[attr.name] === true) {
                    continue;
                }
                const attrSyntax = this.attrParser.parse(attr.name, attr.value);
                const bindingCommand = this.resources.getBindingCommand(attrSyntax, true);
                if (bindingCommand === null || (bindingCommand.bindingType & 4096 /* IgnoreCustomAttr */) === 0) {
                    const attrInfo = this.resources.getAttributeInfo(attrSyntax);
                    if (attrInfo === null) {
                        // map special html attributes to their corresponding properties
                        this.attrSyntaxTransformer.transform(node, attrSyntax);
                        // it's not a custom attribute but might be a regular bound attribute or interpolation (it might also be nothing)
                        this.bindPlainAttribute(
                        /* attrSyntax */ attrSyntax, 
                        /* attr       */ attr, 
                        /* surrogate  */ surrogate, 
                        /* manifest   */ manifest);
                    }
                    else if (attrInfo.isTemplateController) {
                        // the manifest is wrapped by the inner-most template controller (if there are multiple on the same element)
                        // so keep setting manifest.templateController to the latest template controller we find
                        currentController = manifest.templateController = this.declareTemplateController(
                        /* attrSyntax */ attrSyntax, 
                        /* attrInfo   */ attrInfo);
                        // the proxy and the manifest are only identical when we're at the first template controller (since the controller
                        // is assigned to the proxy), so this evaluates to true at most once per node
                        if (manifestProxy === manifest) {
                            currentController.template = manifest;
                            manifestProxy = currentController;
                        }
                        else {
                            currentController.templateController = previousController;
                            currentController.template = previousController.template;
                            previousController.template = currentController;
                        }
                        previousController = currentController;
                    }
                    else {
                        // a regular custom attribute
                        this.bindCustomAttribute(
                        /* attrSyntax */ attrSyntax, 
                        /* attrInfo   */ attrInfo, 
                        /* command    */ bindingCommand, 
                        /* manifest   */ manifest);
                    }
                }
                else {
                    // map special html attributes to their corresponding properties
                    this.attrSyntaxTransformer.transform(node, attrSyntax);
                    // it's not a custom attribute but might be a regular bound attribute or interpolation (it might also be nothing)
                    this.bindPlainAttribute(
                    /* attrSyntax */ attrSyntax, 
                    /* attr       */ attr, 
                    /* surrogate  */ surrogate, 
                    /* manifest   */ manifest);
                }
            }
            if (node.tagName === 'INPUT') {
                const type = node.type;
                if (type === 'checkbox' || type === 'radio') {
                    this.ensureAttributeOrder(manifest);
                }
            }
            let projection = node.getAttribute('au-slot');
            if (projection === '') {
                projection = 'default';
            }
            const hasProjection = projection !== null;
            if (hasProjection && isTemplateControllerOf(manifestProxy, manifest)) {
                // prevents <some-el au-slot TEMPLATE.CONTROLLER></some-el>.
                throw new Error(`Unsupported usage of [au-slot="${projection}"] along with a template controller (if, else, repeat.for etc.) found (example: <some-el au-slot if.bind="true"></some-el>).`);
                /**
                 * TODO: prevent <template TEMPLATE.CONTROLLER><some-el au-slot></some-el></template>.
                 * But there is not easy way for now, as the attribute binding is done after binding the child nodes.
                 * This means by the time the template controller in the ancestor is processed, the projection is already registered.
                 */
            }
            const parentName = (_a = node.parentNode) === null || _a === void 0 ? void 0 : _a.nodeName.toLowerCase();
            if (hasProjection
                && (manifestRoot === null
                    || parentName === void 0
                    || this.resources.getElementInfo(parentName) === null)) {
                /**
                 * Prevents the following cases:
                 * - <template><div au-slot></div></template>
                 * - <my-ce><div><div au-slot></div></div></my-ce>
                 * - <my-ce><div au-slot="s1"><div au-slot="s2"></div></div></my-ce>
                 */
                throw new Error(`Unsupported usage of [au-slot="${projection}"]. It seems that projection is attempted, but not for a custom element.`);
            }
            processTemplateControllers(this.dom, manifestProxy, manifest);
            const projectionOwner = manifest === manifestRoot ? parentManifestRoot : manifestRoot;
            if (!hasProjection || projectionOwner === null) {
                // the proxy is either the manifest itself or the outer-most controller; add it directly to the parent
                parentManifest.childNodes.push(manifestProxy);
            }
            else if (hasProjection) {
                projectionOwner.projections.push(new semantic_model_1.ProjectionSymbol(projection, manifestProxy));
                node.removeAttribute('au-slot');
                node.remove();
            }
        }
        // TODO: refactor to use render priority slots (this logic shouldn't be in the template binder)
        ensureAttributeOrder(manifest) {
            // swap the order of checked and model/value attribute, so that the required observers are prepared for checked-observer
            const attributes = manifest.plainAttributes;
            let modelOrValueIndex = void 0;
            let checkedIndex = void 0;
            let found = 0;
            for (let i = 0; i < attributes.length && found < 3; i++) {
                switch (attributes[i].syntax.target) {
                    case 'model':
                    case 'value':
                    case 'matcher':
                        modelOrValueIndex = i;
                        found++;
                        break;
                    case 'checked':
                        checkedIndex = i;
                        found++;
                        break;
                }
            }
            if (checkedIndex !== void 0 && modelOrValueIndex !== void 0 && checkedIndex < modelOrValueIndex) {
                [attributes[modelOrValueIndex], attributes[checkedIndex]] = [attributes[checkedIndex], attributes[modelOrValueIndex]];
            }
        }
        bindChildNodes(node, surrogate, manifest, manifestRoot, parentManifestRoot) {
            let childNode;
            if (node.nodeName === 'TEMPLATE') {
                childNode = node.content.firstChild;
            }
            else {
                childNode = node.firstChild;
            }
            let nextChild;
            while (childNode !== null) {
                switch (childNode.nodeType) {
                    case 1 /* Element */:
                        nextChild = childNode.nextSibling;
                        this.bindManifest(
                        /* parentManifest     */ manifest, 
                        /* node               */ childNode, 
                        /* surrogate          */ surrogate, 
                        /* manifest           */ manifest, 
                        /* manifestRoot       */ manifestRoot, 
                        /* parentManifestRoot */ parentManifestRoot);
                        childNode = nextChild;
                        break;
                    case 3 /* Text */:
                        childNode = this.bindText(
                        /* textNode */ childNode, 
                        /* manifest */ manifest).nextSibling;
                        break;
                    case 4 /* CDATASection */:
                    case 7 /* ProcessingInstruction */:
                    case 8 /* Comment */:
                    case 10 /* DocumentType */:
                        childNode = childNode.nextSibling;
                        break;
                    case 9 /* Document */:
                    case 11 /* DocumentFragment */:
                        childNode = childNode.firstChild;
                }
            }
        }
        bindText(textNode, manifest) {
            const interpolation = this.exprParser.parse(textNode.wholeText, 2048 /* Interpolation */);
            if (interpolation !== null) {
                const symbol = new semantic_model_1.TextSymbol(this.dom, textNode, interpolation);
                manifest.childNodes.push(symbol);
                processInterpolationText(symbol);
            }
            let next = textNode;
            while (next.nextSibling !== null && next.nextSibling.nodeType === 3 /* Text */) {
                next = next.nextSibling;
            }
            return next;
        }
        declareTemplateController(attrSyntax, attrInfo) {
            let symbol;
            const attrRawValue = attrSyntax.rawValue;
            const command = this.resources.getBindingCommand(attrSyntax, false);
            // multi-bindings logic here is similar to (and explained in) bindCustomAttribute
            const isMultiBindings = attrInfo.noMultiBindings === false && command === null && hasInlineBindings(attrRawValue);
            if (isMultiBindings) {
                symbol = new semantic_model_1.TemplateControllerSymbol(this.dom, attrSyntax, attrInfo);
                this.bindMultiAttribute(symbol, attrInfo, attrRawValue);
            }
            else {
                symbol = new semantic_model_1.TemplateControllerSymbol(this.dom, attrSyntax, attrInfo);
                const bindingType = command === null ? 2048 /* Interpolation */ : command.bindingType;
                const expr = this.exprParser.parse(attrRawValue, bindingType);
                symbol.bindings.push(new semantic_model_1.BindingSymbol(command, attrInfo.bindable, expr, attrRawValue, attrSyntax.target));
            }
            return symbol;
        }
        bindCustomAttribute(attrSyntax, attrInfo, command, manifest) {
            let symbol;
            const attrRawValue = attrSyntax.rawValue;
            // Custom attributes are always in multiple binding mode,
            // except when they can't be
            // When they cannot be:
            //        * has explicit configuration noMultiBindings: false
            //        * has binding command, ie: <div my-attr.bind="...">.
            //          In this scenario, the value of the custom attributes is required to be a valid expression
            //        * has no colon: ie: <div my-attr="abcd">
            //          In this scenario, it's simply invalid syntax. Consider style attribute rule-value pair: <div style="rule: ruleValue">
            const isMultiBindings = attrInfo.noMultiBindings === false && command === null && hasInlineBindings(attrRawValue);
            if (isMultiBindings) {
                // a multiple-bindings attribute usage (semicolon separated binding) is only valid without a binding command;
                // the binding commands must be declared in each of the property bindings
                symbol = new semantic_model_1.CustomAttributeSymbol(attrSyntax, attrInfo);
                this.bindMultiAttribute(symbol, attrInfo, attrRawValue);
            }
            else {
                symbol = new semantic_model_1.CustomAttributeSymbol(attrSyntax, attrInfo);
                const bindingType = command === null ? 2048 /* Interpolation */ : command.bindingType;
                const expr = this.exprParser.parse(attrRawValue, bindingType);
                symbol.bindings.push(new semantic_model_1.BindingSymbol(command, attrInfo.bindable, expr, attrRawValue, attrSyntax.target));
            }
            manifest.customAttributes.push(symbol);
            manifest.isTarget = true;
        }
        bindMultiAttribute(symbol, attrInfo, value) {
            const bindables = attrInfo.bindables;
            const valueLength = value.length;
            let attrName = void 0;
            let attrValue = void 0;
            let start = 0;
            let ch = 0;
            for (let i = 0; i < valueLength; ++i) {
                ch = value.charCodeAt(i);
                if (ch === 92 /* Backslash */) {
                    ++i;
                    // Ignore whatever comes next because it's escaped
                }
                else if (ch === 58 /* Colon */) {
                    attrName = value.slice(start, i);
                    // Skip whitespace after colon
                    while (value.charCodeAt(++i) <= 32 /* Space */)
                        ;
                    start = i;
                    for (; i < valueLength; ++i) {
                        ch = value.charCodeAt(i);
                        if (ch === 92 /* Backslash */) {
                            ++i;
                            // Ignore whatever comes next because it's escaped
                        }
                        else if (ch === 59 /* Semicolon */) {
                            attrValue = value.slice(start, i);
                            break;
                        }
                    }
                    if (attrValue === void 0) {
                        // No semicolon found, so just grab the rest of the value
                        attrValue = value.slice(start);
                    }
                    const attrSyntax = this.attrParser.parse(attrName, attrValue);
                    const attrTarget = kernel_1.camelCase(attrSyntax.target);
                    const command = this.resources.getBindingCommand(attrSyntax, false);
                    const bindingType = command === null ? 2048 /* Interpolation */ : command.bindingType;
                    const expr = this.exprParser.parse(attrValue, bindingType);
                    let bindable = bindables[attrTarget];
                    if (bindable === undefined) {
                        // everything in a multi-bindings expression must be used,
                        // so if it's not a bindable then we create one on the spot
                        bindable = bindables[attrTarget] = new runtime_1.BindableInfo(attrTarget, runtime_1.BindingMode.toView);
                    }
                    symbol.bindings.push(new semantic_model_1.BindingSymbol(command, bindable, expr, attrValue, attrTarget));
                    // Skip whitespace after semicolon
                    while (i < valueLength && value.charCodeAt(++i) <= 32 /* Space */)
                        ;
                    start = i;
                    attrName = void 0;
                    attrValue = void 0;
                }
            }
        }
        bindPlainAttribute(attrSyntax, attr, surrogate, manifest) {
            const command = this.resources.getBindingCommand(attrSyntax, false);
            const bindingType = command === null ? 2048 /* Interpolation */ : command.bindingType;
            const attrTarget = attrSyntax.target;
            const attrRawValue = attrSyntax.rawValue;
            let expr;
            if (attrRawValue.length === 0
                && (bindingType & 53 /* BindCommand */ | 49 /* OneTimeCommand */ | 50 /* ToViewCommand */ | 52 /* TwoWayCommand */) > 0) {
                if ((bindingType & 53 /* BindCommand */ | 49 /* OneTimeCommand */ | 50 /* ToViewCommand */ | 52 /* TwoWayCommand */) > 0) {
                    // Default to the name of the attr for empty binding commands
                    expr = this.exprParser.parse(kernel_1.camelCase(attrTarget), bindingType);
                }
                else {
                    return;
                }
            }
            else {
                expr = this.exprParser.parse(attrRawValue, bindingType);
            }
            if ((manifest.flags & 16 /* isCustomElement */) > 0) {
                const bindable = manifest.bindables[attrTarget];
                if (bindable != null) {
                    // if the attribute name matches a bindable property name, add it regardless of whether it's a command, interpolation, or just a plain string;
                    // the template compiler will translate it to the correct instruction
                    manifest.bindings.push(new semantic_model_1.BindingSymbol(command, bindable, expr, attrRawValue, attrTarget));
                    manifest.isTarget = true;
                }
                else if (expr != null) {
                    // if it does not map to a bindable, only add it if we were able to parse an expression (either a command or interpolation)
                    manifest.plainAttributes.push(new semantic_model_1.PlainAttributeSymbol(attrSyntax, command, expr));
                    manifest.isTarget = true;
                }
            }
            else if (expr != null) {
                // either a binding command, an interpolation, or a ref
                manifest.plainAttributes.push(new semantic_model_1.PlainAttributeSymbol(attrSyntax, command, expr));
                manifest.isTarget = true;
            }
            else if (manifest === surrogate) {
                // any attributes, even if they are plain (no command/interpolation etc), should be added if they
                // are on the surrogate element
                manifest.plainAttributes.push(new semantic_model_1.PlainAttributeSymbol(attrSyntax, command, expr));
            }
            if (command == null && expr != null) {
                // if it's an interpolation, clear the attribute value
                attr.value = '';
            }
        }
    }
    exports.TemplateBinder = TemplateBinder;
});
//# sourceMappingURL=template-binder.js.map