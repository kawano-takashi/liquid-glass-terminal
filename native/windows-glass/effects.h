#pragma once

#include <Windows.Foundation.h>
#include <Windows.Graphics.Effects.h>
#include <Windows.Graphics.Effects.Interop.h>
#include <d2d1_1.h>
#include <d2d1effects.h>
#include <wrl.h>

#include <cwchar>

namespace lgt::effects {

namespace abi = ABI::Windows;
using Microsoft::WRL::ComPtr;

class EffectBase abstract
    : public Microsoft::WRL::RuntimeClass<
          Microsoft::WRL::RuntimeClassFlags<Microsoft::WRL::WinRtClassicComMix>,
          abi::Graphics::Effects::IGraphicsEffect,
          abi::Graphics::Effects::IGraphicsEffectSource,
          abi::Graphics::Effects::IGraphicsEffectD2D1Interop> {
 public:
  IFACEMETHODIMP get_Name(HSTRING* value) override { return name_.CopyTo(value); }
  IFACEMETHODIMP put_Name(HSTRING value) override { return name_.Set(value); }

  IFACEMETHODIMP GetSourceCount(UINT* value) override {
    *value = 1;
    return S_OK;
  }
  IFACEMETHODIMP GetSource(
      UINT index, abi::Graphics::Effects::IGraphicsEffectSource** value) override {
    return index == 0 ? source_.CopyTo(value) : E_INVALIDARG;
  }

  HRESULT SetSource(abi::Graphics::Effects::IGraphicsEffectSource* value) {
    source_ = value;
    return S_OK;
  }

 protected:
  using PropertyMapping = abi::Graphics::Effects::GRAPHICS_EFFECT_PROPERTY_MAPPING;
  using PropertyValue = abi::Foundation::IPropertyValue;
  using PropertyValueStatics = abi::Foundation::IPropertyValueStatics;

  template <typename Callback>
  static HRESULT WithPropertyFactory(const Callback& callback) {
    ComPtr<PropertyValueStatics> factory;
    Microsoft::WRL::Wrappers::HStringReference className{
        RuntimeClass_Windows_Foundation_PropertyValue};
    const HRESULT result = GetActivationFactory(className.Get(), &factory);
    return FAILED(result) ? result : callback(factory.Get());
  }

  struct NamedProperty {
    const wchar_t* name;
    UINT index;
    PropertyMapping mapping;
  };

  static HRESULT FindNamedProperty(
      const NamedProperty* properties, UINT count, LPCWSTR name, UINT* index,
      PropertyMapping* mapping) {
    for (UINT item = 0; item < count; ++item) {
      if (_wcsicmp(name, properties[item].name) == 0) {
        *index = properties[item].index;
        *mapping = properties[item].mapping;
        return S_OK;
      }
    }
    return E_INVALIDARG;
  }

  Microsoft::WRL::Wrappers::HString name_;
  ComPtr<abi::Graphics::Effects::IGraphicsEffectSource> source_;
};

class GaussianBlurEffect final : public EffectBase {
  InspectableClass(L"LiquidGlassTerminal.GaussianBlurEffect", BaseTrust);

 public:
  void BlurAmount(float value) { blurAmount_ = value; }

  IFACEMETHODIMP GetEffectId(GUID* value) override {
    *value = CLSID_D2D1GaussianBlur;
    return S_OK;
  }
  IFACEMETHODIMP GetPropertyCount(UINT* value) override {
    *value = 3;
    return S_OK;
  }
  IFACEMETHODIMP GetProperty(UINT index, PropertyValue** value) override {
    return WithPropertyFactory([&](PropertyValueStatics* factory) {
      switch (index) {
        case D2D1_GAUSSIANBLUR_PROP_STANDARD_DEVIATION:
          return factory->CreateSingle(blurAmount_, reinterpret_cast<IInspectable**>(value));
        case D2D1_GAUSSIANBLUR_PROP_OPTIMIZATION:
          return factory->CreateUInt32(D2D1_GAUSSIANBLUR_OPTIMIZATION_QUALITY,
                                       reinterpret_cast<IInspectable**>(value));
        case D2D1_GAUSSIANBLUR_PROP_BORDER_MODE:
          return factory->CreateUInt32(D2D1_BORDER_MODE_HARD,
                                       reinterpret_cast<IInspectable**>(value));
        default:
          return E_INVALIDARG;
      }
    });
  }
  IFACEMETHODIMP GetNamedPropertyMapping(
      LPCWSTR name, UINT* index, PropertyMapping* mapping) override {
    static constexpr NamedProperty properties[] = {
        {L"BlurAmount", D2D1_GAUSSIANBLUR_PROP_STANDARD_DEVIATION,
         abi::Graphics::Effects::GRAPHICS_EFFECT_PROPERTY_MAPPING_DIRECT},
        {L"Optimization", D2D1_GAUSSIANBLUR_PROP_OPTIMIZATION,
         abi::Graphics::Effects::GRAPHICS_EFFECT_PROPERTY_MAPPING_DIRECT},
        {L"BorderMode", D2D1_GAUSSIANBLUR_PROP_BORDER_MODE,
         abi::Graphics::Effects::GRAPHICS_EFFECT_PROPERTY_MAPPING_DIRECT},
    };
    return FindNamedProperty(properties, ARRAYSIZE(properties), name, index, mapping);
  }

 private:
  float blurAmount_ = 9.0f;
};

}  // namespace lgt::effects
