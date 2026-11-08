import type { Bindings } from "../roles";

export const cmake: Bindings = {
    attribute: { tm: ['support.function.commandProperty.cmake'] },
    function: { tm: ['support.function.cmake'] },
    plain: {
        tm: ['variable.other'],
    },
    string: { tm: ['variable.parameter.cmake'] },
    type: { tm: ['support.type.property.cmake', 'support.type.variable.cmake'] },
}
