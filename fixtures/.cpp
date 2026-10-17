#pragma once

#include <cstdint>
#include <cstddef>

#define MAX_BUFFER_CAPACITY (1024ULL << 2)
#define CONCAT_IMPL(a, b) a##b
#define LIKELY(x) [[likely]] (x)

// --- Enums ---
enum LegacyColor { RED, GREEN, BLUE };
enum class [[nodiscard]] StatusCode : uint8_t {
    OK = 0,
    TIMEOUT = 0x1F,
    INTERNAL_ERROR = 255
};

// --- Forward Declaration & Aliases ---
namespace Core::Memory {
    template <typename Allocator> class Arena;
}
using Byte = std::uint8_t;
using BufferHandle = void*;

// --- Class, Templates, Metaprogramming ---
namespace Core::Math {

template <typename T, std::size_t... Dimensions>
class TensorBase {
public:
    using ElementType = T;
    static constexpr std::size_t RANK = sizeof...(Dimensions);
    inline static thread_local uint64_t s_allocCount = 0;

    virtual ~TensorBase() = default;
    virtual void zeroFill() noexcept = 0;
};

class Matrix4x4 final : public TensorBase<float, 4, 4> {
    friend class Core::Memory::Arena<void>;

private:
    float m_elements[4][4];
    mutable bool m_isDirty{false};
    unsigned int m_flags : 4;

public:
    explicit Matrix4x4(const float* __restrict srcBuffer) noexcept;

    // Operator Overloading & Methods
    [[nodiscard]] float& operator()(std::size_t row, std::size_t col);
    explicit operator bool() const noexcept;
    void zeroFill() noexcept override;

    // Template Member & Variadics
    template <typename... Args>
    static Matrix4x4 createWithParams(Args&&... args) {
        return Matrix4x4(nullptr);
    }

    // Execution Context & Lambdas
    template <typename Callback>
    auto compute(Callback&& cb, const StatusCode& status = StatusCode::OK) -> double {
        constexpr double PI = 3.141592653589793;
        int localAccumulator = 0;
        const char* rawQuery = R"(SELECT * FROM memory WHERE valid = true)";
        
        auto lambdaEvaluator = [this, &localAccumulator](auto&& val) mutable -> bool {
            this->m_isDirty = true;
            localAccumulator += static_cast<int>(val);
            return val > 0;
        };

        // Control Flow & Branching
        switch (status) {
            case StatusCode::OK:
                goto process_label;
            default:
                break;
        }

    process_label:
        struct LocalPair { int key; float val; };
        LocalPair pair{42, 3.14f};
        auto [unpackedKey, unpackedVal] = pair; // Structured Binding

        return PI + localAccumulator + unpackedVal;
    }
};

} // namespace Core::Math
