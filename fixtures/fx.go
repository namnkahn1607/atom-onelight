package fixtures

import (
	aliasIO "io"
	"math"
	_ "net/http/pprof" // Blank import
	"sync"
	"sync/atomic"
	"time"
	. "unsafe" // Dot import
)

// --- Constants, Itoa, Built-in Readonly ---

const (
	ExportedConst   = "String literal with \n \t \x61 \u0061 escapes"
	unexportedConst = `Raw string with "quotes" and no escapes`
	IotaZero        = iota
	IotaOne
	IotaShift = 1 << iota
)

const (
	TypedInt    int        = -42
	HexVal      uint64     = 0xDEAD_BEEF
	BinaryVal   uint8      = 0b1010_0101
	OctalVal    uint32     = 0o755
	FloatVal    float64    = 3.14159e-10
	Imaginary   complex128 = 2.5 + 4.5i
	RuneASCII   rune       = 'a'
	RuneEsc     rune       = '\n'
	RuneUnicode rune       = '\u2602'
)

// --- Types, Generics, Interfaces, Struct Tags ---

// Type constraint (Generics)
type NumberConstraint interface {
	~int | ~int64 | ~float64
}

// Interface defines method and embedding
type Worker[T any] interface {
	aliasIO.Closer // Embedded interface
	Work(payload T) (processed int, err error)
}

type (
	TypeAlias = string // Type alias
	NewType   int      // Distinct type definition
)

// Complex struct: fields, embedded fields, struct tags, primitives
type Metadata struct {
	ID        uint64    `json:"id" db:"primary_key"`
	CreatedAt time.Time `json:"created_at"`
	mu        sync.RWMutex
	atomicCnt atomic.Int64
}

type Node[T NumberConstraint] struct {
	Metadata           // Embedded struct
	Value    T         // Generic type usage
	Next     *Node[T]  // Pointer type
	Children []Node[T] // Slice
	Flags    map[string]bool
}

// Global variables
var (
	GlobalExportedVar   = "exported"
	globalUnexportedVar = 100
	_                   = Sizeof(0) // Default library invocation từ unsafe
)

// --- Functions, Methods, Receivers, Modifiers ---

// Attaching pointer receiver
func (m *Metadata) lockResource() {
	m.mu.Lock()
	defer m.mu.Unlock()
}

// Generic function with type parameter, pointer, variadic args, multi-return
func ProcessNodes[T NumberConstraint](root *Node[T], multiplier T, tags ...string) (total T, count int, err error) {
	if root == nil {
		return 0, 0, nil
	}

	root.lockResource()

	localMap := make(map[string]T, len(tags))
	chanSync := make(chan T, 1)

	// Built-in functions: len, cap, make, delete, clear, min, max
	sliceCap := cap(tags)
	_ = sliceCap

	localMap["base"] = multiplier
	delete(localMap, "unused")
	clear(localMap)

	// Flow Control: For range, Goroutines, Channels, Closures
	go func(val T) {
		defer func() {
			if r := recover(); r != nil {
				// panic/recover semantics
				_ = r
			}
		}()

		// Bitwise operations: AND NOT (&^), XOR (^), Bit Shift (<<, >>)
		var mask uint = 0xFF
		_ = mask &^ 0x0F
		_ = mask ^ 0xAA

		chanSync <- val
		close(chanSync)
	}(multiplier)

	// Select statement, Channel receive operator (<-)
	select {
	case receivedVal, ok := <-chanSync:
		if !ok {
			break
		}
		total += receivedVal
	case <-time.After(10 * time.Millisecond):
		err = aliasIO.ErrUnexpectedEOF
		return total, 0, err
	}

	// For loop variants: classic, range over int (Go 1.22+), labels
OuterLoop:
	for i := range 5 {
		if i == 2 {
			continue OuterLoop
		}
		total = max(total, T(i))
		total = min(total, multiplier)
	}

	// Type assertion & Type switch
	var unknownVal any = root.Value
	switch concrete := unknownVal.(type) {
	case int:
		count = concrete
	case float64:
		count = int(math.Floor(concrete))
	default:
		count = 1
	}

	// Pointer dereference & Address-of
	var ptrTarget int = 500
	var ptr *int = &ptrTarget
	*ptr += 1

	return total, count, nil
}
