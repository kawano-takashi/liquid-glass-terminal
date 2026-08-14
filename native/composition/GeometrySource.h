#pragma once

#include <unknwn.h>
#include <d2d1_1.h>
#include <wrl.h>

#include <Windows.Graphics.Interop.h>
#include <windows.graphics.h>
#include <winrt/Windows.Graphics.h>
#include <winrt/base.h>

namespace lgt::composition {

class GeometrySource final
    : public Microsoft::WRL::RuntimeClass<
          Microsoft::WRL::RuntimeClassFlags<Microsoft::WRL::WinRtClassicComMix>,
          ABI::Windows::Graphics::IGeometrySource2D,
          ABI::Windows::Graphics::IGeometrySource2DInterop> {
 public:
  explicit GeometrySource(Microsoft::WRL::ComPtr<ID2D1Geometry> geometry)
      : geometry_(std::move(geometry)) {}

  HRESULT __stdcall GetGeometry(ID2D1Geometry** value) noexcept override {
    if (!value) return E_POINTER;
    return geometry_.CopyTo(value);
  }

  HRESULT __stdcall TryGetGeometryUsingFactory(ID2D1Factory* factory,
                                                ID2D1Geometry** value) noexcept override {
    if (!factory || !value) return E_POINTER;
    *value = nullptr;
    Microsoft::WRL::ComPtr<ID2D1Factory> current;
    geometry_->GetFactory(&current);
    if (current.Get() != factory) return E_NOTIMPL;
    return geometry_.CopyTo(value);
  }

 private:
  Microsoft::WRL::ComPtr<ID2D1Geometry> geometry_;
};

}  // namespace lgt::composition
