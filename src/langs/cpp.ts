import type { Bindings } from "../roles";

export const cpp : Bindings = {
    affix: { tm: ['keyword.other.unit'] },
    attribute: { tm: ['support.other.attribute', 'entity.other.attribute-name'] },
    comment: { tm: ['comment'] },
    declarator: { tm: ['storage.modifier.pointer', 'storage.modifier.reference'] },
    enumMember: { tm: ['variable.other.enummember'], semantic: ['enumMember'] },
    escape: { tm: ['constant.character.escape'] },
    function: {
        tm: ['entity.name.function'],
        semantic: ['function', 'method', 'class.constructorOrDestructor'],
    },
    keyword: {
        tm: [
            'keyword.control',  // incl. preprocessor directives
            'keyword.operator.noexcept',
            'keyword.other',  // using, default, namespace, operator, decltype, static_assert
            'storage.type',  // class, struct, enum, template, namespace, access-specifiers, decltype
            'storage.modifier',  // const, constexpr, static, inline, virtual, noexcept, override
            'constant.language',  // true, false, nullptr
            'variable.language',  // this
            'entity.name.operator.type',  // operator bool
        ],
        semantic: [
            'modifier',
            'type.deduced', 'class.deduced', 'enum.deduced',  // auto, decltype
            'type.defaultLibrary.fileScope',  // size_t, uint8_t, int32_t, ptrdiff_t
        ],
    },
    macro: { tm: ['entity.name.function.preprocessor'], semantic: ['macro'] },
    number: {
        tm: [
            'constant.numeric',
            'meta.function.definition.parameters.special.constructor meta.parameter',
        ],
    },
    operator: {
        tm: [
            'keyword.operator',
            'entity.name.operator',
            'punctuation.separator.pointer-access',
            'punctuation.separator.dot-access',
        ],
        semantic: ['operator'],
    },
    parameter: { tm: ['variable.parameter'], semantic: ['parameter'] },
    placeholder: { tm: ['constant.other.placeholder'] },
    plain: {
        tm: [
            'variable.parameter.preprocessor',
            'variable.parameter.capture',
            'punctuation.section.attribute',
            'punctuation.separator.delimiter.comma',
            'punctuation.separator.parameters',
        ],
        semantic: ['bracket', 'label', 'namespace', 'variable'],
    },
    string: { tm: ['string'] },
    type: {
        tm: [
            'entity.name.type',
            'entity.name.scope-resolution.function.definition',
        ],
        semantic: ['type', 'class', 'enum', 'struct', 'interface', 'typeParameter'],
    },
}
