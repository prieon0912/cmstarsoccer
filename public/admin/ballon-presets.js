(function(root){const presets=[
  {
    "id": "messi",
    "name": "메시",
    "clubId": "BAR",
    "pos": "RW",
    "ovr": 98,
    "num": 10,
    "foot": "L",
    "wf": 4,
    "stars": 5,
    "st": {
      "pace": 94,
      "shoot": 98,
      "pass": 97,
      "drib": 99,
      "tackle": 42,
      "phy": 80
    },
    "hid": {
      "att": 2,
      "def": 0,
      "run": "link",
      "roam": 2,
      "press": "contain",
      "focus": 2,
      "read": 0
    }
  },
  {
    "id": "cristiano",
    "name": "호날두",
    "clubId": "RMA",
    "pos": "ST",
    "ovr": 98,
    "num": 7,
    "foot": "R",
    "wf": 4,
    "stars": 5,
    "st": {
      "pace": 96,
      "shoot": 99,
      "pass": 89,
      "drib": 95,
      "tackle": 48,
      "phy": 96
    },
    "hid": {
      "att": 2,
      "def": 0,
      "run": "runner",
      "roam": 1,
      "press": "contain",
      "focus": 2,
      "read": 0
    }
  },
  {
    "id": "ronaldo",
    "name": "호나우두",
    "clubId": "INT",
    "pos": "ST",
    "ovr": 98,
    "num": 9,
    "foot": "R",
    "wf": 5,
    "stars": 5,
    "st": {
      "pace": 98,
      "shoot": 99,
      "pass": 88,
      "drib": 98,
      "tackle": 40,
      "phy": 95
    },
    "hid": {
      "att": 2,
      "def": 0,
      "run": "runner",
      "roam": 2,
      "press": "contain",
      "focus": 2,
      "read": 0
    }
  },
  {
    "id": "ronaldinho",
    "name": "호나우지뉴",
    "clubId": "BAR",
    "pos": "LW",
    "ovr": 97,
    "num": 10,
    "foot": "R",
    "wf": 4,
    "stars": 5,
    "st": {
      "pace": 94,
      "shoot": 95,
      "pass": 97,
      "drib": 99,
      "tackle": 46,
      "phy": 86
    },
    "hid": {
      "att": 2,
      "def": 0,
      "run": "link",
      "roam": 2,
      "press": "contain",
      "focus": 2,
      "read": 0
    }
  },
  {
    "id": "kaka",
    "name": "카카",
    "clubId": "MIL",
    "pos": "CAM",
    "ovr": 96,
    "num": 22,
    "foot": "R",
    "wf": 4,
    "stars": 5,
    "st": {
      "pace": 97,
      "shoot": 95,
      "pass": 95,
      "drib": 98,
      "tackle": 55,
      "phy": 87
    },
    "hid": {
      "att": 2,
      "def": 1,
      "run": "runner",
      "roam": 2,
      "press": "contain",
      "focus": 2,
      "read": 1
    }
  },
  {
    "id": "modric",
    "name": "모드리치",
    "clubId": "RMA",
    "pos": "CM",
    "ovr": 96,
    "num": 10,
    "foot": "R",
    "wf": 4,
    "stars": 4,
    "st": {
      "pace": 86,
      "shoot": 88,
      "pass": 99,
      "drib": 98,
      "tackle": 81,
      "phy": 80
    },
    "hid": {
      "att": 1,
      "def": 2,
      "run": "link",
      "roam": 1,
      "press": "aggr",
      "focus": 2,
      "read": 2
    }
  },
  {
    "id": "rodri",
    "name": "로드리",
    "clubId": "MCI",
    "pos": "CDM",
    "ovr": 95,
    "num": 16,
    "foot": "R",
    "wf": 4,
    "stars": 3,
    "st": {
      "pace": 81,
      "shoot": 89,
      "pass": 97,
      "drib": 91,
      "tackle": 97,
      "phy": 96
    },
    "hid": {
      "att": 1,
      "def": 2,
      "run": "link",
      "roam": 0,
      "press": "contain",
      "focus": 2,
      "read": 2
    }
  },
  {
    "id": "dembele",
    "name": "뎀벨레",
    "clubId": "PSG",
    "pos": "RW",
    "ovr": 96,
    "num": 10,
    "foot": "L",
    "wf": 5,
    "stars": 5,
    "st": {
      "pace": 99,
      "shoot": 96,
      "pass": 93,
      "drib": 99,
      "tackle": 57,
      "phy": 82
    },
    "hid": {
      "att": 2,
      "def": 1,
      "run": "runner",
      "roam": 2,
      "press": "aggr",
      "focus": 2,
      "read": 1
    }
  },
  {
    "id": "kane",
    "name": "케인",
    "clubId": "FCB",
    "pos": "ST",
    "ovr": 96,
    "num": 9,
    "foot": "R",
    "wf": 5,
    "stars": 3,
    "st": {
      "pace": 85,
      "shoot": 99,
      "pass": 95,
      "drib": 91,
      "tackle": 58,
      "phy": 96
    },
    "hid": {
      "att": 2,
      "def": 1,
      "run": "link",
      "roam": 1,
      "press": "contain",
      "focus": 2,
      "read": 1
    }
  },
  {
    "id": "zidane",
    "name": "지단",
    "clubId": "RMA",
    "pos": "CAM",
    "ovr": 97,
    "num": 5,
    "foot": "R",
    "wf": 5,
    "stars": 5,
    "st": {
      "pace": 89,
      "shoot": 95,
      "pass": 99,
      "drib": 98,
      "tackle": 73,
      "phy": 94
    },
    "hid": {
      "att": 2,
      "def": 1,
      "run": "link",
      "roam": 2,
      "press": "contain",
      "focus": 2,
      "read": 1
    }
  },
  {
    "id": "van-basten",
    "name": "반바스텐",
    "clubId": "MIL",
    "pos": "ST",
    "ovr": 97,
    "num": 9,
    "foot": "R",
    "wf": 4,
    "stars": 4,
    "st": {
      "pace": 92,
      "shoot": 99,
      "pass": 89,
      "drib": 94,
      "tackle": 42,
      "phy": 95
    },
    "hid": {
      "att": 2,
      "def": 0,
      "run": "runner",
      "roam": 1,
      "press": "contain",
      "focus": 2,
      "read": 0
    }
  },
  {
    "id": "gullit",
    "name": "굴리트",
    "clubId": "MIL",
    "pos": "CM",
    "ovr": 97,
    "num": 10,
    "foot": "R",
    "wf": 5,
    "stars": 4,
    "st": {
      "pace": 94,
      "shoot": 96,
      "pass": 96,
      "drib": 95,
      "tackle": 93,
      "phy": 99
    },
    "hid": {
      "att": 2,
      "def": 2,
      "run": "bal",
      "roam": 1,
      "press": "aggr",
      "focus": 2,
      "read": 2
    }
  },
  {
    "id": "gerd-muller",
    "name": "게르트 뮐러",
    "clubId": "FCB",
    "pos": "ST",
    "ovr": 96,
    "num": 9,
    "foot": "R",
    "wf": 4,
    "stars": 3,
    "st": {
      "pace": 92,
      "shoot": 99,
      "pass": 86,
      "drib": 92,
      "tackle": 45,
      "phy": 96
    },
    "hid": {
      "att": 2,
      "def": 1,
      "run": "runner",
      "roam": 1,
      "press": "aggr",
      "focus": 2,
      "read": 1
    }
  },
  {
    "id": "beckenbauer",
    "name": "베켄바워",
    "clubId": "FCB",
    "pos": "CB",
    "ovr": 97,
    "num": 5,
    "foot": "R",
    "wf": 4,
    "stars": 3,
    "st": {
      "pace": 92,
      "shoot": 83,
      "pass": 98,
      "drib": 95,
      "tackle": 99,
      "phy": 95
    },
    "hid": {
      "att": 1,
      "def": 2,
      "run": "link",
      "roam": 1,
      "press": "contain",
      "focus": 2,
      "read": 2
    }
  },
  {
    "id": "cruyff",
    "name": "크루이프",
    "clubId": "BAR",
    "pos": "CF",
    "ovr": 98,
    "num": 14,
    "foot": "R",
    "wf": 5,
    "stars": 5,
    "st": {
      "pace": 97,
      "shoot": 97,
      "pass": 98,
      "drib": 99,
      "tackle": 60,
      "phy": 85
    },
    "hid": {
      "att": 2,
      "def": 1,
      "run": "link",
      "roam": 2,
      "press": "aggr",
      "focus": 2,
      "read": 1
    }
  },
  {
    "id": "platini",
    "name": "플라티니",
    "clubId": "JUV",
    "pos": "CAM",
    "ovr": 97,
    "num": 10,
    "foot": "R",
    "wf": 4,
    "stars": 4,
    "st": {
      "pace": 88,
      "shoot": 97,
      "pass": 99,
      "drib": 97,
      "tackle": 63,
      "phy": 85
    },
    "hid": {
      "att": 2,
      "def": 1,
      "run": "link",
      "roam": 2,
      "press": "contain",
      "focus": 2,
      "read": 1
    }
  },
  {
    "id": "yashin",
    "name": "야신",
    "clubId": null,
    "pos": "GK",
    "ovr": 97,
    "num": 1,
    "foot": "R",
    "wf": 3,
    "stars": 1,
    "st": {
      "pace": 76,
      "shoot": 30,
      "pass": 86,
      "drib": 64,
      "tackle": 50,
      "phy": 98
    },
    "hid": {
      "att": 0,
      "def": 2,
      "run": "bal",
      "roam": 0,
      "press": "contain",
      "focus": 2,
      "read": 2
    }
  }
];if(typeof module!=="undefined"&&module.exports)module.exports=presets;else root.FL11_BALLON_PRESETS=presets;})(globalThis);
