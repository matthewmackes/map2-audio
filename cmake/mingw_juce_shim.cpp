/**
 * mingw_juce_shim.cpp
 *
 * MinGW cross-compilation shims for JUCE 8 on Windows.
 * Provides two symbols missing from Fedora's mingw64 package:
 *
 * 1. DCompositionCreateDevice – libdcomp.a in Fedora mingw64 only ships
 *    DCompositionCreateDevice2/3.  We forward the v1 call to v2; the
 *    signatures are compatible (v2's first arg is IUnknown* which is a
 *    base of the IDXGIDevice* that v1 accepts).
 *
 * 2. __mingw_uuidof<juce::ComSmartPtr<IDXGISurface>>() – JUCE calls
 *    __uuidof() on its own ComSmartPtr wrapper type; MinGW's headers only
 *    declare the specialisation for the raw IDXGISurface interface.
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <dxgi.h>
#include <dcomp.h>

// ---------------------------------------------------------------------------
// 1. DCompositionCreateDevice
//    Forward to DCompositionCreateDevice2 which is present in Fedora mingw64.
//    Both functions have identical signatures; the only difference is that v1
//    documents IDXGIDevice* as first arg while v2 uses IUnknown* (compatible).
// ---------------------------------------------------------------------------
extern "C"
HRESULT WINAPI DCompositionCreateDevice2 (IUnknown*, REFIID, void**);

extern "C"
HRESULT WINAPI DCompositionCreateDevice (IDXGIDevice* dxgiDevice,
                                          REFIID       iid,
                                          void**       dcompositionDevice)
{
    return DCompositionCreateDevice2 (static_cast<IUnknown*> (dxgiDevice),
                                      iid,
                                      dcompositionDevice);
}

// ---------------------------------------------------------------------------
// 2. __mingw_uuidof<juce::ComSmartPtr<IDXGISurface>>
//    JUCE's ComSmartPtr<T> is a thin COM smart pointer. When JUCE calls
//    __uuidof(someComSmartPtr), MinGW resolves it to
//    __mingw_uuidof<ComSmartPtr<T>>() which is not declared by the system
//    headers (they only have __mingw_uuidof<IDXGISurface>).
//
//    IDXGISurface GUID: {CAFCB56C-6AC3-4889-BF47-9E23BBD260EC}
// ---------------------------------------------------------------------------
namespace juce { template <class T> class ComSmartPtr; }

template <>
const GUID& __mingw_uuidof<juce::ComSmartPtr<IDXGISurface>> ()
{
    static const GUID iid = {
        0xCAFCB56C, 0x6AC3, 0x4889,
        { 0xBF, 0x47, 0x9E, 0x23, 0xBB, 0xD2, 0x60, 0xEC }
    };
    return iid;
}
