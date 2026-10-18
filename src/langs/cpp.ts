import type { Bindings } from "../roles";

export const cpp : Bindings = {
    affix: { tm: ['keyword.other.unit'] },
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
            'support.other.attribute',  // [[...]]
            'entity.other.attribute-name',
        ],
        semantic: ['modifier'],  // final, override
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
        tm: ['variable.parameter.preprocessor', 'variable.parameter.capture'],
        semantic: ['bracket', 'label', 'namespace', 'property', 'variable'],
    },
    string: { tm: ['string'] },
    type: {
        tm: [
            'entity.name.type',
            'storage.type.built-in',  // primitives
            'storage.type.return-type',  // `-> T` of lambdas
            'entity.name.operator.type'
        ],
        semantic: ['type', 'class', 'enum', 'struct', 'interface', 'typeParameter'],
    },
}
