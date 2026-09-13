{
  "targets": [
    {
      "target_name": "window_layer",
      "defines": [
        "NAPI_VERSION=8"
      ],
      "conditions": [
        [
          "OS=='win'",
          {
            "sources": [
              "window_layer.cc"
            ],
            "libraries": [
              "comctl32.lib",
              "user32.lib"
            ]
          }
        ],
        [
          "OS=='linux'",
          {
            "sources": [
              "window_layer_linux.cc"
            ],
            "libraries": [
              "-lX11"
            ]
          }
        ]
      ]
    }
  ]
}
