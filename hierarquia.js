window.HIERARQUIA_DADOS = {
  DVSME: {
    tipo: "divisional",
    distritais: {
      DTSCA: ["TUB01A", "RSU01A", "NVT01A", "JOI02A", "JGS01A", "FLN01A", "CCM01A"],
      DTRGS: ["URN01A", "SLP01A", "RIA01A", "POA24A", "POA23A", "PMS01A", "PFU01A", "PET01A", "NOH01A", "CXJ01A", "CNO01A", "BEG01A"],
      DTPRN: ["PGZ01A", "MGF01A", "LDB01A", "GPU01A", "CWB24A", "CWB23A", "CWB21A", "CWB21"],
      DTMGL: ["VAR01A", "DVN01A", "CON01A", "CLF01A", "BTI01A", "BHZ25A", "BHZ23A", "BHZ23", "BHZ21A", "BHZ21"],
      DTMGE: ["VIX02A", "VIX01A", "PAT01A", "MON01A", "LIN01A", "JMO01A", "IPT01A", "CGO01A"]
    }
  },
  DVSDE: {
    tipo: "divisional",
    distritais: {
      RGRIO: ["TSP01A", "RIO26", "RIO25A", "RIO24A", "RIO23A", "RIO23", "REZ01A", "NIT02A", "MAE01A", "JFO01A", "DCX01A"],
      RGKPN: ["SOR02A", "SJK01A", "PRC01A", "POC01A", "JUN01A", "JAC01A", "CPQ25A", "CPQ22A", "CPQ21A", "CPQ01", "CGT01A"],
      DTSPI: ["UDI02A", "UBA01A", "SRP02A", "SRP01A", "RPT03A", "PPD01A", "MII01A", "FRA01A", "BAU01A", "ARB01A", "AQA01A"],
      DTSPA: ["STS01A", "SAO65A", "SAO64A", "SAO63A", "SAO62A", "SAO54A", "SAO53A", "SAO52A", "SAO51A", "SAO50A", "SAO43", "SAO42"]
    }
  },
  DVKAM: {
    tipo: "divisional",
    distritais: {
      RGKAM: ["SAOKA", "SAO3KA", "SAO2KA", "RIOKA", "REM2KA", "REM1KA", "NDEKA", "CWBKA", "CPQKA", "CKSKA", "BHZKA"]
    }
  },
  DVINT: {
    tipo: "divisional",
    distritais: {
      DTIN5: ["S3I03A", "S3I01A", "RSI07A", "RSI06A", "RSI03A", "RSI02A", "RSI01A", "PSI12A", "PSI11A", "PSI07A", "NOR07A", "NOR05A", "NOR04A", "NOR01A", "KPI08A", "EVI01A"],
      DTIN4: ["SPI05A", "SPI03A", "SPI01A", "KPI07A", "KPI06A", "KPI05A", "KPI03A", "KPI02A", "KPI01A"],
      DTIN3: ["RJI05A", "RJI04A", "RJI03A", "RJI01A", "REI03A", "REI02A", "REI01A", "MOI03A", "MOI01A", "MLI08A", "MLI05A", "MLI03A", "MLI02A", "MLI01A"],
      DTIN2: ["SPI06A", "S1I06A", "S1I05A", "S1I03A", "S1I02A", "S1I01A", "PSI10A", "PSI04A", "PSI03A", "PSI01A", "COI08A", "COI04A", "COI03A", "COI02A", "COI01A"],
      DTIN1: ["S3I04A", "S2I06A", "S2I05A", "S2I03A", "S2I02A", "S2I01A", "NSI07A", "NSI03A", "NOI02A", "NOI01A", "NLI04A", "NLI02A", "NLI01A", "KPI04A"]
    }
  },
  DVCNN: {
    tipo: "divisional",
    distritais: {
      RGNDS: ["SSA26A", "SSA25A", "SSA22A", "LAU01A", "IOS01A", "FSA01A", "CAM01A", "AJU02A"],
      RGCOE: ["TLS01A", "SRS01A", "RVE01A", "RON01A", "GYN02A", "GYN01A", "CUI02A", "CGR01A", "BSB01A", "BSB01"],
      DTNDE: ["REC22A", "REC21A", "REC21", "PZN01", "NAT01A", "MCZ01A", "JZN01A", "JPA01A", "FOR04A", "FOR03A", "FOR02A", "FOR01A"],
      DTMTP: ["THE01A", "SLZ01A", "SLZ01", "PLM01A", "PGO01A", "MAB01A", "IMP01A", "BRA01A"],
      DTAMA: ["RBC01A", "MAU02A", "MAU01A", "MAC01A", "JIP01A", "BVT01A", "BEL02A"]
    }
  },
  DTTRA: {
    tipo: "especial",
    semSharePai: true,
    referencia: "DVSDE",
    distritais: {
      DTTRA: ["BHZ24B", "RIO24T", "CWB21B", "SAO16B", "EVI26B", "EVI24B", "SAO17B", "EVI25B", "SAO19B"]
    }
  }
};
