import type { Bindings } from "../roles";

export const cpp : Bindings = {
    affix: { tm: ['keyword.other.unit'] },
    attribute: { tm: ['support.other.attribute'] },
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
            'keyword.other',  // using, default, namespace, operator, decltype, static_assert
            'storage.type',  // class, struct, enum, template, namespace, access-specifiers, decltype
            'storage.modifier',  // const, constexpr, static, inline, virtual, noexcept, override
            'constant.language',  // true, false, nullptr
            'variable.language',  // this
            'entity.other.attribute-name',  // #pragma once
            'entity.name.operator.type',  // operator bool
        ],
        semantic: [
            'modifier',
            'type.deduced', 'class.deduced', 'enum.deduced',  // auto, decltype
            'type.defaultLibrary.fileScope',  // size_t, uint8_t, int32_t, ptrdiff_t
        ],
    },
    macro: { tm: ['entity.name.function.preprocessor'], semantic: ['macro'] },
    number: { tm: ['constant.numeric'] },
    operator: {
        tm: ['keyword.operator', 'entity.name.operator'],
        semantic: ['operator'],
    },
    parameter: { tm: ['variable.parameter'], semantic: ['parameter'] },
    placeholder: { tm: ['constant.other.placeholder'] },
    plain: {
        tm: ['variable.parameter.preprocessor', 'variable.parameter.capture', 'punctuation.section.attribute'],
        semantic: ['bracket', 'label', 'namespace', 'property', 'variable'],
    },
    string: { tm: ['string'] },
    type: {
        tm: ['entity.name.type'],
        semantic: ['type', 'class', 'enum', 'struct', 'interface', 'typeParameter'],
    },
}
