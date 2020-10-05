var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { PLATFORM, Registration, mergeArrays, toArray, ILogger, } from '@aurelia/kernel';
import { HydrateAttributeInstruction, HydrateElementInstruction, HydrateTemplateController, IExpressionParser, InterpolationInstruction, ITemplateCompiler, LetBindingInstruction, LetElementInstruction, SetPropertyInstruction, CustomElementDefinition, IDOM, BindingMode, Bindable, CustomElement, SlotInfo, AuSlotContentType, ProjectionContext, IAttributeParser, ResourceModel, } from '@aurelia/runtime';
import { IAttrSyntaxTransformer } from './attribute-syntax-transformer';
import { TemplateBinder } from './template-binder';
import { ITemplateElementFactory } from './template-element-factory';
import { SetAttributeInstruction, SetClassAttributeInstruction, SetStyleAttributeInstruction, TextBindingInstruction } from './instructions';
class CustomElementCompilationUnit {
    constructor(partialDefinition, surrogate, template) {
        this.partialDefinition = partialDefinition;
        this.surrogate = surrogate;
        this.template = template;
        this.instructions = [];
        this.surrogates = [];
        this.projectionsMap = new Map();
    }
    toDefinition() {
        const def = this.partialDefinition;
        return CustomElementDefinition.create({
            ...def,
            instructions: mergeArrays(def.instructions, this.instructions),
            surrogates: mergeArrays(def.surrogates, this.surrogates),
            template: this.template,
            needsCompile: false,
            hasSlots: this.surrogate.hasSlots,
            projectionsMap: this.projectionsMap,
        });
    }
}
var LocalTemplateBindableAttributes;
(function (LocalTemplateBindableAttributes) {
    LocalTemplateBindableAttributes["property"] = "property";
    LocalTemplateBindableAttributes["attribute"] = "attribute";
    LocalTemplateBindableAttributes["mode"] = "mode";
})(LocalTemplateBindableAttributes || (LocalTemplateBindableAttributes = {}));
const allowedLocalTemplateBindableAttributes = Object.freeze([
    "property" /* property */,
    "attribute" /* attribute */,
    "mode" /* mode */
]);
const localTemplateIdentifier = 'as-custom-element';
/**
 * Default (runtime-agnostic) implementation for `ITemplateCompiler`.
 *
 * @internal
 */
let TemplateCompiler = /** @class */ (() => {
    let TemplateCompiler = class TemplateCompiler {
        constructor(factory, attrParser, exprParser, attrSyntaxModifier, logger, dom) {
            this.factory = factory;
            this.attrParser = attrParser;
            this.exprParser = exprParser;
            this.attrSyntaxModifier = attrSyntaxModifier;
            this.dom = dom;
            this.logger = logger.scopeTo('TemplateCompiler');
        }
        get name() {
            return 'default';
        }
        static register(container) {
            return Registration.singleton(ITemplateCompiler, this).register(container);
        }
        compile(partialDefinition, context, targetedProjections) {
            const definition = CustomElementDefinition.getOrCreate(partialDefinition);
            if (definition.template === null || definition.template === void 0) {
                return definition;
            }
            const resources = ResourceModel.getOrCreate(context);
            const { attrParser, exprParser, attrSyntaxModifier, factory } = this;
            const dom = context.get(IDOM);
            const binder = new TemplateBinder(dom, resources, attrParser, exprParser, attrSyntaxModifier);
            const template = definition.enhance === true
                ? definition.template
                : factory.createTemplate(definition.template);
            processLocalTemplates(template, definition, context, dom, this.logger);
            const surrogate = binder.bind(template);
            const compilation = this.compilation = new CustomElementCompilationUnit(definition, surrogate, template);
            const customAttributes = surrogate.customAttributes;
            const plainAttributes = surrogate.plainAttributes;
            const customAttributeLength = customAttributes.length;
            const plainAttributeLength = plainAttributes.length;
            if (customAttributeLength + plainAttributeLength > 0) {
                let offset = 0;
                for (let i = 0; customAttributeLength > i; ++i) {
                    compilation.surrogates[offset] = this.compileCustomAttribute(customAttributes[i]);
                    offset++;
                }
                for (let i = 0; i < plainAttributeLength; ++i) {
                    compilation.surrogates[offset] = this.compilePlainAttribute(plainAttributes[i], true);
                    offset++;
                }
            }
            this.compileChildNodes(surrogate, compilation.instructions, compilation.projectionsMap, targetedProjections);
            const compiledDefinition = compilation.toDefinition();
            this.compilation = null;
            return compiledDefinition;
        }
        compileChildNodes(parent, instructionRows, projections, targetedProjections) {
            if ((parent.flags & 16384 /* hasChildNodes */) > 0) {
                const childNodes = parent.childNodes;
                const ii = childNodes.length;
                let childNode;
                for (let i = 0; i < ii; ++i) {
                    childNode = childNodes[i];
                    if ((childNode.flags & 128 /* isText */) > 0) {
                        instructionRows.push([new TextBindingInstruction(childNode.interpolation)]);
                    }
                    else if ((childNode.flags & 32 /* isLetElement */) > 0) {
                        const bindings = childNode.bindings;
                        const instructions = [];
                        let binding;
                        const jj = bindings.length;
                        for (let j = 0; j < jj; ++j) {
                            binding = bindings[j];
                            instructions[j] = new LetBindingInstruction(binding.expression, binding.target);
                        }
                        instructionRows.push([new LetElementInstruction(instructions, childNode.toBindingContext)]);
                    }
                    else {
                        this.compileParentNode(childNode, instructionRows, projections, targetedProjections);
                    }
                }
            }
        }
        compileCustomElement(symbol, instructionRows, projections, targetedProjections) {
            var _a;
            const isAuSlot = (symbol.flags & 512 /* isAuSlot */) > 0;
            // offset 1 to leave a spot for the hydrate instruction so we don't need to create 2 arrays with a spread etc
            const instructionRow = this.compileAttributes(symbol, 1);
            const slotName = symbol.slotName;
            let slotInfo = null;
            if (isAuSlot) {
                // eslint-disable-next-line @typescript-eslint/no-extra-non-null-assertion,@typescript-eslint/no-unnecessary-type-assertion
                const targetedProjection = (_a = targetedProjections === null || targetedProjections === void 0 ? void 0 : targetedProjections.projections) === null || _a === void 0 ? void 0 : _a[slotName];
                slotInfo = targetedProjection !== void 0
                    ? new SlotInfo(slotName, AuSlotContentType.Projection, new ProjectionContext(targetedProjection, targetedProjections === null || targetedProjections === void 0 ? void 0 : targetedProjections.scope))
                    : new SlotInfo(slotName, AuSlotContentType.Fallback, new ProjectionContext(this.compileProjectionFallback(symbol, projections, targetedProjections)));
            }
            const instruction = instructionRow[0] = new HydrateElementInstruction(symbol.res, this.compileBindings(symbol), slotInfo);
            const compiledProjections = this.compileProjections(symbol, projections, targetedProjections);
            if (compiledProjections !== null) {
                projections.set(instruction, compiledProjections);
            }
            instructionRows.push(instructionRow);
            if (!isAuSlot) {
                this.compileChildNodes(symbol, instructionRows, projections, targetedProjections);
            }
        }
        compilePlainElement(symbol, instructionRows, projections, targetedProjections) {
            const attributes = this.compileAttributes(symbol, 0);
            if (attributes.length > 0) {
                instructionRows.push(attributes);
            }
            this.compileChildNodes(symbol, instructionRows, projections, targetedProjections);
        }
        compileParentNode(symbol, instructionRows, projections, targetedProjections) {
            switch (symbol.flags & 1023 /* type */) {
                case 16 /* isCustomElement */:
                case 512 /* isAuSlot */:
                    this.compileCustomElement(symbol, instructionRows, projections, targetedProjections);
                    break;
                case 64 /* isPlainElement */:
                    this.compilePlainElement(symbol, instructionRows, projections, targetedProjections);
                    break;
                case 1 /* isTemplateController */:
                    this.compileTemplateController(symbol, instructionRows, projections, targetedProjections);
            }
        }
        compileTemplateController(symbol, instructionRows, projections, targetedProjections) {
            const bindings = this.compileBindings(symbol);
            const controllerInstructionRows = [];
            this.compileParentNode(symbol.template, controllerInstructionRows, projections, targetedProjections);
            const def = CustomElementDefinition.create({
                name: symbol.res,
                template: symbol.physicalNode,
                instructions: controllerInstructionRows,
                needsCompile: false,
            });
            instructionRows.push([new HydrateTemplateController(def, symbol.res, bindings, symbol.res === 'else')]);
        }
        compileBindings(symbol) {
            let bindingInstructions;
            if ((symbol.flags & 8192 /* hasBindings */) > 0) {
                // either a custom element with bindings, a custom attribute / template controller with dynamic options,
                // or a single value custom attribute binding
                const { bindings } = symbol;
                const len = bindings.length;
                bindingInstructions = Array(len);
                let i = 0;
                for (; i < len; ++i) {
                    bindingInstructions[i] = this.compileBinding(bindings[i]);
                }
            }
            else {
                bindingInstructions = PLATFORM.emptyArray;
            }
            return bindingInstructions;
        }
        compileBinding(symbol) {
            if (symbol.command === null) {
                // either an interpolation or a normal string value assigned to an element or attribute binding
                if (symbol.expression === null) {
                    // the template binder already filtered out non-bindables, so we know we need a setProperty here
                    return new SetPropertyInstruction(symbol.rawValue, symbol.bindable.propName);
                }
                else {
                    // either an element binding interpolation or a dynamic options attribute binding interpolation
                    return new InterpolationInstruction(symbol.expression, symbol.bindable.propName);
                }
            }
            else {
                // either an element binding command, dynamic options attribute binding command,
                // or custom attribute / template controller (single value) binding command
                return symbol.command.compile(symbol);
            }
        }
        compileAttributes(symbol, offset) {
            let attributeInstructions;
            if ((symbol.flags & 4096 /* hasAttributes */) > 0) {
                // any attributes on a custom element (which are not bindables) or a plain element
                const customAttributes = symbol.customAttributes;
                const plainAttributes = symbol.plainAttributes;
                const customAttributeLength = customAttributes.length;
                const plainAttributesLength = plainAttributes.length;
                attributeInstructions = Array(offset + customAttributeLength + plainAttributesLength);
                for (let i = 0; customAttributeLength > i; ++i) {
                    attributeInstructions[offset] = this.compileCustomAttribute(customAttributes[i]);
                    offset++;
                }
                for (let i = 0; plainAttributesLength > i; ++i) {
                    attributeInstructions[offset] = this.compilePlainAttribute(plainAttributes[i], false);
                    offset++;
                }
            }
            else if (offset > 0) {
                attributeInstructions = Array(offset);
            }
            else {
                attributeInstructions = PLATFORM.emptyArray;
            }
            return attributeInstructions;
        }
        compileCustomAttribute(symbol) {
            // a normal custom attribute (not template controller)
            const bindings = this.compileBindings(symbol);
            return new HydrateAttributeInstruction(symbol.res, bindings);
        }
        compilePlainAttribute(symbol, isOnSurrogate) {
            if (symbol.command === null) {
                const syntax = symbol.syntax;
                if (symbol.expression === null) {
                    const attrRawValue = syntax.rawValue;
                    if (isOnSurrogate) {
                        switch (syntax.target) {
                            case 'class':
                                return new SetClassAttributeInstruction(attrRawValue);
                            case 'style':
                                return new SetStyleAttributeInstruction(attrRawValue);
                            // todo:  define how to merge other attribute peacefully
                            //        this is an existing feature request
                        }
                    }
                    // a plain attribute on a surrogate
                    return new SetAttributeInstruction(attrRawValue, syntax.target);
                }
                else {
                    // a plain attribute with an interpolation
                    return new InterpolationInstruction(symbol.expression, syntax.target);
                }
            }
            else {
                // a plain attribute with a binding command
                return symbol.command.compile(symbol);
            }
        }
        // private compileAttribute(symbol: IAttributeSymbol): HTMLAttributeInstruction {
        //   // any attribute on a custom element (which is not a bindable) or a plain element
        //   if (symbol.flags & SymbolFlags.isCustomAttribute) {
        //     return this.compileCustomAttribute(symbol as CustomAttributeSymbol);
        //   } else {
        //     return this.compilePlainAttribute(symbol as PlainAttributeSymbol);
        //   }
        // }
        compileProjections(symbol, projectionMap, targetedProjections) {
            var _a;
            if ((symbol.flags & 32768 /* hasProjections */) === 0) {
                return null;
            }
            const dom = this.dom;
            const projections = Object.create(null);
            const $projections = symbol.projections;
            const len = $projections.length;
            for (let i = 0; i < len; ++i) {
                const projection = $projections[i];
                const name = projection.name;
                const instructions = [];
                this.compileParentNode(projection.template, instructions, projectionMap, targetedProjections);
                const definition = projections[name];
                if (definition === void 0) {
                    let template = projection.template.physicalNode;
                    if (template.tagName !== 'TEMPLATE') {
                        const _template = dom.createTemplate();
                        dom.appendChild(_template.content, template);
                        template = _template;
                    }
                    projections[name] = CustomElementDefinition.create({ name, template, instructions, needsCompile: false });
                }
                else {
                    // consolidate the projections to same slot
                    dom.appendChild(definition.template.content, (_a = projection.template) === null || _a === void 0 ? void 0 : _a.physicalNode);
                    definition.instructions.push(...instructions);
                }
            }
            return projections;
        }
        compileProjectionFallback(symbol, projections, targetedProjections) {
            const instructions = [];
            this.compileChildNodes(symbol, instructions, projections, targetedProjections);
            const template = this.dom.createTemplate();
            template.content.append(...toArray(symbol.physicalNode.childNodes));
            return CustomElementDefinition.create({ name: CustomElement.generateName(), template, instructions, needsCompile: false });
        }
    };
    TemplateCompiler = __decorate([
        __param(0, ITemplateElementFactory),
        __param(1, IAttributeParser),
        __param(2, IExpressionParser),
        __param(3, IAttrSyntaxTransformer),
        __param(4, ILogger),
        __param(5, IDOM),
        __metadata("design:paramtypes", [Object, Object, Object, Object, Object, Object])
    ], TemplateCompiler);
    return TemplateCompiler;
})();
export { TemplateCompiler };
function getTemplateName(localTemplate, localTemplateNames) {
    const name = localTemplate.getAttribute(localTemplateIdentifier);
    if (name === null || name === '') {
        throw new Error('The value of "as-custom-element" attribute cannot be empty for local template');
    }
    if (localTemplateNames.has(name)) {
        throw new Error(`Duplicate definition of the local template named ${name}`);
    }
    else {
        localTemplateNames.add(name);
    }
    return name;
}
function getBindingMode(bindable) {
    switch (bindable.getAttribute("mode" /* mode */)) {
        case 'oneTime':
            return BindingMode.oneTime;
        case 'toView':
            return BindingMode.toView;
        case 'fromView':
            return BindingMode.fromView;
        case 'twoWay':
            return BindingMode.twoWay;
        case 'default':
        default:
            return BindingMode.default;
    }
}
function processLocalTemplates(template, definition, context, dom, logger) {
    let root;
    if (template.nodeName === 'TEMPLATE') {
        if (template.hasAttribute(localTemplateIdentifier)) {
            throw new Error('The root cannot be a local template itself.');
        }
        root = template.content;
    }
    else {
        root = template;
    }
    const localTemplates = toArray(root.querySelectorAll('template[as-custom-element]'));
    const numLocalTemplates = localTemplates.length;
    if (numLocalTemplates === 0) {
        return;
    }
    if (numLocalTemplates === root.childElementCount) {
        throw new Error('The custom element does not have any content other than local template(s).');
    }
    const localTemplateNames = new Set();
    for (const localTemplate of localTemplates) {
        if (localTemplate.parentNode !== root) {
            throw new Error('Local templates needs to be defined directly under root.');
        }
        const name = getTemplateName(localTemplate, localTemplateNames);
        const localTemplateType = class LocalTemplate {
        };
        const content = localTemplate.content;
        const bindableEls = toArray(content.querySelectorAll('bindable'));
        const bindableInstructions = Bindable.for(localTemplateType);
        const properties = new Set();
        const attributes = new Set();
        for (const bindableEl of bindableEls) {
            if (bindableEl.parentNode !== content) {
                throw new Error('Bindable properties of local templates needs to be defined directly under root.');
            }
            const property = bindableEl.getAttribute("property" /* property */);
            if (property === null) {
                throw new Error(`The attribute 'property' is missing in ${bindableEl.outerHTML}`);
            }
            const attribute = bindableEl.getAttribute("attribute" /* attribute */);
            if (attribute !== null
                && attributes.has(attribute)
                || properties.has(property)) {
                throw new Error(`Bindable property and attribute needs to be unique; found property: ${property}, attribute: ${attribute}`);
            }
            else {
                if (attribute !== null) {
                    attributes.add(attribute);
                }
                properties.add(property);
            }
            bindableInstructions.add({
                property,
                attribute: attribute !== null && attribute !== void 0 ? attribute : void 0,
                mode: getBindingMode(bindableEl),
            });
            const ignoredAttributes = bindableEl.getAttributeNames().filter((attrName) => !allowedLocalTemplateBindableAttributes.includes(attrName));
            if (ignoredAttributes.length > 0) {
                logger.warn(`The attribute(s) ${ignoredAttributes.join(', ')} will be ignored for ${bindableEl.outerHTML}. Only ${allowedLocalTemplateBindableAttributes.join(', ')} are processed.`);
            }
            content.removeChild(bindableEl);
        }
        const div = dom.createElement('div');
        div.appendChild(content);
        const localTemplateDefinition = CustomElement.define({ name, template: div.innerHTML }, localTemplateType);
        // the casting is needed here as the dependencies are typed as readonly array
        definition.dependencies.push(localTemplateDefinition);
        context.register(localTemplateDefinition);
        root.removeChild(localTemplate);
    }
}
//# sourceMappingURL=template-compiler.js.map