# Evaluation results: eval/paraphrase-c.json (hosted Worker https://cavli-assignment-2.nishanameenk.workers.dev, keyword retrieval)

Run at 2026-11-15T10:01:48+00:00 UTC. 13/16 cases passed. 18/18 citations (including related-context citations) were verified by re-extracting the cited page from the source file.

| ID | Type | Question | Expected behaviour | Expected source | Observed status | Cited locations | Citation validity | Result | Failure category | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| C01 | paraphrase | How many general-purpose I/O lines does the module give me? | 4 GPIO interfaces. | hardware-manual p. 13/39; product-page Interfaces | answered | HW 5.3 p. 13; HW 5.3 p. 39 | 2/2 valid | PASS | none | 2919 ms |
| C02 | paraphrase | How fast does the I2C bus run? | Clock rate of 400 kHz (high-speed mode up to 3.3 Mbps is also stated). | hardware-manual p. 43/13 | answered | HW 5.3 p. 43; HW 5.3 p. 13 | 2/2 valid | PASS | none | 1400 ms |
| C03 | paraphrase | How much current does the GPS part use while tracking satellites? | GNSS tracking 60 mA (Table 5.5). | hardware-manual p. 61 | not_verified | none | n/a | FAIL | retrieval_miss | 180 ms |
| C04 | paraphrase | How many modules come on one reel? | SPQ 500 per tape and reel. | hardware-manual p. 67/68/69/70 | answered | HW 5.3 p. 69 | 1/1 valid | PASS | none | 7648 ms |
| C05 | paraphrase | What impedance should my antenna feed line be designed for? | 50 ohm characteristic impedance. | hardware-manual p. 14/45/46/50/56 | answered | HW 5.3 p. 47; HW 5.3 p. 45 | 2/2 valid | PASS | none | 23683 ms |
| C06 | paraphrase | What reference voltage does the module put out for level shifting? | VDD_EXT, a 1.8 V output (pin 29). | hardware-manual p. 23/27/29/30/36 | answered | HW 5.3 p. 29; HW 5.3 p. 27; HW 5.3 p. 30 | 3/3 valid | PASS | none | 9041 ms |
| C07 | paraphrase | Which serial port outputs the debug logs? | UART0 carries DM (debug/logging) data. | hardware-manual p. 13/33/34 | answered | HW 5.3 p. 33; HW 5.3 p. 34; HW 5.3 p. 35 | 3/3 valid | PASS | none | 1315 ms |
| C08 | paraphrase | What is the highest voltage I can put on the ADC pins? | The ADC input voltage cannot exceed VBAT. | hardware-manual p. 44 | answered | HW 5.3 p. 44 | 1/1 valid | PASS | none | 5856 ms |
| C09 | paraphrase | How much current does the module draw in its second sleep level? | Sleep 2: 25 µA. | hardware-manual p. 61 | not_verified | none | n/a | FAIL | retrieval_miss | 1091 ms |
| C10 | paraphrase | Does the module need separate antennas for cellular and GPS? | Yes: one main antenna and one GNSS antenna interface. | hardware-manual p. 14/45/51/52/54/56; product-page Interfaces | answered | HW 5.3 p. 45; HW 5.3 p. 46 | 2/2 valid | PASS | none | 1629 ms |
| C11 | unanswerable | What warranty period does Cavli give on the C16QS? | Not verified: no warranty period is stated (only a copyright disclaimer). | none (no source should support an answer) | not_verified | none | n/a | PASS | none | 1389 ms |
| C12 | unanswerable | How much does the C16QS weigh? | Not verified: no weight is stated. | none (no source should support an answer) | not_verified | none | n/a | PASS | none | 136 ms |
| C13 | unanswerable | What is the lead time for ordering 5,000 C16QS modules? | Not verified: no lead time is stated. | none (no source should support an answer) | not_verified | none | n/a | PASS | none | 1328 ms |
| C14 | unanswerable | Is the C16QS certified for use on the AT&T network? | Not verified: no carrier certification is stated (FCC text is not carrier approval). | none (no source should support an answer) | answered | HW 5.3 p. 76; HW 5.3 p. 75 | 2/2 valid | FAIL | unsupported_answer | 42163 ms |
| C15 | unanswerable | What IP rating does the C16QS have against dust and water? | Not verified: no IP rating is stated. | none (no source should support an answer) | not_verified | none | n/a | PASS | none | 519 ms |
| C16 | unanswerable | What is the maximum altitude the module can operate at? | Not verified: no altitude limit is stated. | none (no source should support an answer) | not_verified | none | n/a | PASS | none | 17366 ms |

## Observed answers

### C01 - How many general-purpose I/O lines does the module give me?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 2919 ms

> The C16QS module contains four general purpose GPIO interfaces [HW-v5.3-p013-1]. These consist of four general purpose control signals, specifically GPIO1, GPIO7, AGPIO5, and AGPIO7 [HW-v5.3-p039-1].

- Citation `HW-v5.3-p013-1`: valid (quote found on PDF page 13 (printed 13))
- Citation `HW-v5.3-p039-1`: valid (quote found on PDF page 39 (printed 39))

### C02 - How fast does the I2C bus run?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1400 ms

> The C16QS module I2C interface has a clock rate of 400 KHz [HW-v5.3-p043-1]. Additionally, the module's key features table notes that the high speed mode supports a 3.3Mbps rate [HW-v5.3-p013-1].

- Citation `HW-v5.3-p043-1`: valid (quote found on PDF page 43 (printed 43))
- Citation `HW-v5.3-p013-1`: valid (quote found on PDF page 13 (printed 13))

### C03 - How much current does the GPS part use while tracking satellites?

Status: **not_verified** - mode `coverage threshold` - 180 ms

> Not verified in the available C16QS sources. The closest passages do not cover the question's key terms.


### C04 - How many modules come on one reel?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 7648 ms

> The C16QS module is packaged in a tape reel with 500 pcs per reel, which is shipped as a tape reel sealed bag. [HW-v5.3-p069-3]

- Citation `HW-v5.3-p069-3`: valid (quote found on PDF page 69 (printed 69))

### C05 - What impedance should my antenna feed line be designed for?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 23683 ms

> The characteristic impedance of the antenna feed line must be controlled at 50Ω [HW-v5.3-p047-2]. Both the main antenna interface (pin 60) and the GNSS antenna interface (pin 49) are designed for a 50Ω characteristic impedance [HW-v5.3-p045-1].

- Citation `HW-v5.3-p047-2`: valid (quote found on PDF page 47 (printed 47))
- Citation `HW-v5.3-p045-1`: valid (quote found on PDF page 45 (printed 45))

### C06 - What reference voltage does the module put out for level shifting?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 9041 ms

> The C16QS module outputs 1.8V through the VDD_EXT pin (pin 29), which serves as the logic level voltage and can be used for level shifting chips with a maximum load of 50mA [HW-v5.3-p029-3, HW-v5.3-p027-2, HW-v5.3-p030-3].

- Citation `HW-v5.3-p029-3`: valid (quote found on PDF page 29 (printed 29))
- Citation `HW-v5.3-p027-2`: valid (quote found on PDF page 27 (printed 27))
- Citation `HW-v5.3-p030-3`: valid (quote found on PDF page 30 (printed 30))

### C07 - Which serial port outputs the debug logs?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1315 ms

> The UART0 serial interface can only be used as the debug UART of the module [HW-v5.3-p033-3]. Additionally, the UART1 serial port can be used to print program log information [HW-v5.3-p034-2, HW-v5.3-p035-2].

- Citation `HW-v5.3-p033-3`: valid (quote found on PDF page 33 (printed 33))
- Citation `HW-v5.3-p034-2`: valid (quote found on PDF page 34 (printed 34))
- Citation `HW-v5.3-p035-2`: valid (quote found on PDF page 35 (printed 35))

### C08 - What is the highest voltage I can put on the ADC pins?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 5856 ms

> The ADC interface input voltage cannot exceed VBAT [HW-v5.3-p044-2]. Additionally, the ADC pin definitions table specifies a maximum voltage of 3.4 V for ADC0 and ADC1 [HW-v5.3-p044-2]. It is recommended to use a voltage divider circuit for the ADC pin input [HW-v5.3-p044-2].

- Citation `HW-v5.3-p044-2`: valid (quote found on PDF page 44 (printed 44))

### C09 - How much current does the module draw in its second sleep level?

Status: **not_verified** - mode `gemini:gemini-3.1-flash-lite` - 1091 ms

> Not verified in the available C16QS sources. The provided passages do not contain information regarding the current draw of the module in its second sleep level.


### C10 - Does the module need separate antennas for cellular and GPS?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1629 ms

> Yes, the C16QS module provides two separate antenna interfaces: a main set antenna interface (pin 60) for CAT.1bis signals and a dedicated GNSS antenna interface (pin 49) for GPS and BEIDOU [HW-v5.3-p045-1]. The GNSS antenna must maintain a certain distance from the main antenna [HW-v5.3-p046-1].

- Citation `HW-v5.3-p045-1`: valid (quote found on PDF page 45 (printed 45))
- Citation `HW-v5.3-p046-1`: valid (quote found on PDF page 46 (printed 46))

### C11 - What warranty period does Cavli give on the C16QS?

Status: **not_verified** - mode `gemini:gemini-3.1-flash-lite` - 1389 ms

> Not verified in the available C16QS sources. The provided documentation does not contain information regarding the warranty period for the Cavli C16QS module.


### C12 - How much does the C16QS weigh?

Status: **not_verified** - mode `coverage threshold` - 136 ms

> Not verified in the available C16QS sources. The closest passages do not cover the question's key terms.


### C13 - What is the lead time for ordering 5,000 C16QS modules?

Status: **not_verified** - mode `gemini:gemini-3.1-flash-lite` - 1328 ms

> Not verified in the available C16QS sources. The provided passages do not contain information regarding the lead time for ordering 5,000 C16QS modules.


### C14 - Is the C16QS certified for use on the AT&T network?

Status: **answered** - mode `extractive` - 42163 ms

> “9.4.4 Validity of using the module certification: In the event that these conditions cannot be met (for example certain laptop configurations or co-location with another transmitter), then the FCC authorization for this module in combination with the host equipment is no longer considered valid and the FCC ID of the module cannot be used on the final product. In” [HW-v5.3-p076-1] “9.4.1 FCC Modular Approval Information Examples for Manual: • Connect the equipment into an outlet on a circuit different from that to which the receiver is connected. • Consult the dealer or an experienced radio/TV technician for help.” [HW-v5.3-p075-1]

- Citation `HW-v5.3-p076-1`: valid (quote found on PDF page 76 (printed 76))
- Citation `HW-v5.3-p075-1`: valid (quote found on PDF page 75 (printed 75))
- Generation note: generation unavailable (Gemini timed out (after retry))

### C15 - What IP rating does the C16QS have against dust and water?

Status: **not_verified** - mode `coverage threshold` - 519 ms

> Not verified in the available C16QS sources. The closest passages do not cover the question's key terms.


### C16 - What is the maximum altitude the module can operate at?

Status: **not_verified** - mode `gemini:gemini-3.1-flash-lite` - 17366 ms

> Not verified in the available C16QS sources. The provided documentation does not contain information regarding the maximum altitude at which the module can operate.

