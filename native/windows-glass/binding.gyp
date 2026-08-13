{
  "targets": [
    {
      "target_name": "windows_glass",
      "sources": ["windows-glass.cc"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<(module_root_dir)/../../.winapp/include"
      ],
      "defines": [
        "NODE_ADDON_API_CPP_EXCEPTIONS",
        "NOMINMAX",
        "WIN32_LEAN_AND_MEAN",
        "WINVER=0x0A00",
        "_WIN32_WINNT=0x0A00"
      ],
      "libraries": [
        "dwmapi.lib",
        "runtimeobject.lib",
        "windowsapp.lib"
      ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "AdditionalOptions": ["/std:c++20", "/permissive-", "/FS"]
        }
      },
      "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"]
    }
  ]
}
