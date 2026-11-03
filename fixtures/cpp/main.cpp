#pragma once

#include <cstdint>
#include <cstddef>
#include <vector>
#include <string>
#include <utility>
#include <ostream>

#define MAX_BUFFER_CAPACITY (1024ULL << 2)
#define CONCAT_IMPL(a, b) a##b
#define LIKELY(x) __builtin_expect(!!(x), 1)

// --- Preprocessor Conditional & Inactive Code ---
#ifdef MAX_BUFFER_CAPACITY
    constexpr int ACTIVE_CONFIG = 1;
#endif

#if 0
    int disabledDeadCode = 0xDEAD;
#endif

// --- Enums ---
enum LegacyColor { RED, GREEN, BLUE };
enum class [[nodiscard]] StatusCode : uint8_t {
    OK = 0,
    TIMEOUT = 0x1F,
    INTERNAL_ERROR = 255
};

// --- Forward Declaration, Aliases & Static Assert ---
namespace Core::Memory {
    template <typename Allocator> class Arena;
    inline void freeGlobalLog(const char* fmt, int val) noexcept {}
}
using Byte = std::uint8_t;
using BufferHandle = void*;
static_assert(sizeof(Byte) == 1, "Byte must be exactly 1 byte");

// --- User-Defined Literal (UDL) ---
constexpr std::size_t operator""_kb(unsigned long long n) noexcept {
    return static_cast<std::size_t>(n * 1024ULL);
}

// --- Class, Templates, Metaprogramming ---
namespace Core::Math {

using namespace Core::Memory; // using namespace directive

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

    // Stream Operator<< Overload (Definition & Usage)
    friend std::ostream& operator<<(std::ostream& os, const Matrix4x4& mat) {
        return os << mat.m_elements[0][0];
    }

    // Template Member & Variadics
    template <typename... Args>
    static Matrix4x4 createWithParams(Args&&... args) {
        return Matrix4x4(nullptr);
    }

    // Execution Context, Calls, Literals & Memory Management
    template <typename Callback>
    auto compute(Callback&& cb, const StatusCode& status = StatusCode::OK) -> double {
        constexpr double PI = 3.141592653589793;
        constexpr auto kBlockSize = 64_kb; // UDL usage
        int localAccumulator = static_cast<int>(MAX_BUFFER_CAPACITY); // Macro use (object)
        int CONCAT_IMPL(dynamic_, 1) = 10; // Macro use (function-like)

        // Char literals, String escapes, Format placeholders, Raw strings
        char nullChar = '\0';
        char asciiChar = 'A';
        const char* escapedStr = "a\tb\n\x41";
        const char* rawQuery = R"(SELECT * FROM memory WHERE valid = true)";

        // Standard Library Containers & std::move
        std::vector<std::string> labelList = {escapedStr, "item_2"};
        std::vector<std::string> movedList = std::move(labelList);

        // Function Calls: Free function & Member function
        freeGlobalLog("Status: %d, Char: %c\n", localAccumulator);
        this->zeroFill();
        std::size_t count = movedList.size();

        // decltype & Dynamic Allocation (new / delete)
        decltype(localAccumulator)* heapPtr = new decltype(localAccumulator)(42);
        delete heapPtr;

        auto lambdaEvaluator = [this, &localAccumulator](auto&& val) mutable -> bool {
            this->m_isDirty = true;
            localAccumulator += static_cast<int>(val);
            return LIKELY(val > 0); // Macro use with attribute
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

        return PI + localAccumulator + unpackedVal + static_cast<double>(kBlockSize + count + nullChar + asciiChar);
    }
};

} // namespace Core::Math
