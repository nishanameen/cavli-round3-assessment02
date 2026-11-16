# Demo transcript (actual CLI output)

Captured by `python scripts/capture_demo.py`. Chapter 06 uses a copy of the index (`cache/demo-revision.sqlite`) so the SIMULATED revision never touches the main index.

## 01 / Sources and revisions

```text
> python -m docintel sources
AT   rev 3.1                          current    date=2024-09-10  pages=245  passages=462  via=cache (hash verified)
     Cavli C16QS LTE Cat 1.bis AT Command Manual (at_command_manual)  https://itbrainpower.net/downloadables/C16QS_AT_Command_Manual_ERV_3_1.pdf
EVK  rev 1.1                          current    date=2023-03-07  pages=20   passages=28   via=cache (hash verified)
     Cavli C16QS EVK User Manual (Connection Manual) (evk_user_manual)  https://mc-technologies.com/wp-content/uploads/2024/01/Cavli-C16QS-EVK-User-Manual-ERV-1.1.pdf
HW   rev 5.3                          current    date=2024-12-07  pages=82   passages=139  via=cache (hash verified)
     Cavli C16QS LTE CAT1.bis Module Hardware Manual (hardware_manual)  https://www.tme.eu/Document/236509bdd47a1fae18533456c25b4f7b/C16QS-WW-GNAH-DTE.pdf
WEB  rev snapshot-20261114-c81b8bc8   current    date=not stated  pages=-    passages=30   via=cache
     Cavli C16QS LTE Cat 1bis IoT Module product page (product_page)  https://www.cavliwireless.com/iot-modules/c-series/c16qs
```

## 02 / Repeatable ingest and review queue

```text
> python -m docintel ingest --refresh
Ingesting sources from sources/manifest.json
  HW   5.3                          unchanged  139 passages  (cache (hash verified))
  EVK  1.1                          unchanged   28 passages  (cache (hash verified))
  AT   3.1                          unchanged  462 passages  (cache (hash verified))
  WEB  snapshot-20261114-c81b8bc8   unchanged   30 passages  (downloaded)
Checks: {"band_conflicts": 4, "at_reference_gaps": 1, "stale_references": 1}
```

```text
> python -m docintel review
#1 [open] conflict (high) bands:EAJ
  EAJ variant LTE band list differs (cross-source); disputed bands: 38. Do not treat any disputed
  band as confirmed.
#2 [open] conflict (high) bands:LA
  LA variant LTE band list differs (cross-source); disputed bands: 28. Do not treat any disputed
  band as confirmed.
#3 [open] conflict (high) bands:NA
  NA variant LTE band list differs (cross-source); disputed bands: 13. Do not treat any disputed
  band as confirmed.
#4 [open] conflict (high) bands:WW
  WW variant LTE band list differs (cross-source); disputed bands: 13, 38. Do not treat any disputed
  band as confirmed.
#5 [open] cross_reference_gap (medium) at:AT+TRB
  AT+TRB is referenced in Cavli C16QS LTE CAT1.bis Module Hardware Manual (rev 5.3, page 31) but is
  not documented in the current AT Command Manual.
#6 [open] outdated_reference (low) stale:c16qs-evk-user-manual
  Cavli C16QS EVK User Manual (Connection Manual) 1.1 (2023-03-07) is based on an unversioned
  'Hardware Manual' but the current Cavli C16QS LTE CAT1.bis Module Hardware Manual is 5.3
  (2024-12-07). Module statements in it may be outdated.
```

## 03 / Cited answer with page and section

```text
> python -m docintel ask "Which pin resets the bare C16QS module, and how long must it be held low?"

Q: Which pin resets the bare C16QS module, and how long must it be held low?
[ANSWERED]  mode=gemini:gemini-3.1-flash-lite  1442 ms
  The reset pin for the C16QS module is Pin 17 (RSTN). To reset the module, this pin must be pulled
  low for a duration of 100-500ms.
Citations:
  [HW-v5.3-p031-2] Cavli C16QS LTE CAT1.bis Module Hardware Manual, rev 5.3 (current), p. 31, 3.4.2 Reset Control
      https://www.tme.eu/Document/236509bdd47a1fae18533456c25b4f7b/C16QS-WW-GNAH-DTE.pdf#page=31
      "3.4.2 Reset Control The C16QS module Pin 17th is a reset pin. The application detects that
      the module is abnormal. When the software does not respond, the module can be reset. Pull the
      pin low for 100-500ms to reset the module. The RESET pin is sensitive to interference. A 10nF
      to 0.1uF capacitor can be installed near the signal for signal filtering. Keep away from RF
      interference signals when routing. Figure 6 ..."
  ~ Review #5 (cross_reference_gap, medium): AT+TRB is referenced in Cavli C16QS LTE CAT1.bis Module
  ~ Hardware Manual (rev 5.3, page 31) but is not documented in the current AT Command Manual.
Retrieved: HW-v5.3-p031-2(1.05), HW-v5.3-p030-3(0.7572), HW-v5.3-p024-1(0.6855), HW-v5.3-p022-1(0.6801), HW-v5.3-p028-1(0.6724), HW-v5.3-p052-1(0.6568)
```

## 04 / Ambiguous scope: module or EVK?

```text
> python -m docintel ask "What supply voltage does the C16QS need?"

Q: What supply voltage does the C16QS need?
[AMBIGUOUS - clarify]  mode=gemini:gemini-3.1-flash-lite (per scope)  2820 ms
  This depends on what you are powering. Bare module: The C16QS module operates with a power supply
  range between 3.1V and 4.5V [HW-v5.3-p028-1]. The typical supply voltage is 3.8V [HW-v5.3-p027-2,
  HW-v5.3-p028-1]. These specifications apply to the VBAT_BB pins (32, 33) and VBAT_RF pins (52, 53)
  [HW-v5.3-p027-2]. EVK board: The Cavli C16QS EVK supports power input via USB Type-C or a +5V
  Adapter, which can be selected using Jumper 3 (JMP 3) [EVK-v1.1-p012-1].
  Clarify: Do you mean the bare C16QS module (VBAT) or the C16QS EVK board input?
Citations:
  [HW-v5.3-p027-2] Cavli C16QS LTE CAT1.bis Module Hardware Manual, rev 5.3 (current), p. 27, 3.3.1 Power Supply Design
      https://www.tme.eu/Document/236509bdd47a1fae18533456c25b4f7b/C16QS-WW-GNAH-DTE.pdf#page=27
      "3.3.1 Power Supply Design The power interface of the C16QS module is as follows: Table 3.5
      Power pin definitions Power supply Pin No. Definition IO Description Remarks V_Min V_Typ V_Max
      32, 33 VBAT_BB PI Module input voltage - 3.1V 3.8V 4.5V 52, 53 VBAT_RF PI Module input voltage
      - 3.1V 3.8V 4.5V 43 USIM_VDD PO External SIM card power supply Output voltage 1.8/3 1.75/2 .95
      1.8/3 1.85/3. 05 98 GNSS_VRTC PI GNSS RTC ..."
  [HW-v5.3-p028-1] Cavli C16QS LTE CAT1.bis Module Hardware Manual, rev 5.3 (current), p. 28, 3.3.1 Power Supply Design
      https://www.tme.eu/Document/236509bdd47a1fae18533456c25b4f7b/C16QS-WW-GNAH-DTE.pdf#page=28
      "The C16QS module can be powered by a single power supply mode. ▪ The module has 4 channels of
      power supply, two VBAT_BB and two VBAT_RF pins. ▪ The module power supply range is between
      3.1V – 4.5V ▪ It is recommended to use 3.8 V/830 mA power supply. ▪ If the module's operating
      voltage drop causes the VCC supply voltage to be too low or the supply current is
      insufficient, the module may shut down or restart. ..."
  [EVK-v1.1-p012-1] Cavli C16QS EVK User Manual (Connection Manual), rev 1.1 (current), p. 13, PDF page 12, 2.4 Component description
      https://mc-technologies.com/wp-content/uploads/2024/01/Cavli-C16QS-EVK-User-Manual-ERV-1.1.pdf#page=12
      "3. Power Key (ESP 32) This button is used to power ON ESP32. 4. Boot (ESP32) This button is
      used to enter flashing mode in ESP32. 5. Enable (ESP32) This button is used to enable the 3.3V
      regulator of ESP32. 6. Reset Key (C16QS) This button is used to reset the module. 7. POWER Key
      (C16QS) This button is used to turn ON the module. 8. Jumper 3 (JMP 3) This Jumper is used to
      switch between the voltage sources (USB ..."
  ~ Review #6 (outdated_reference, low): Cavli C16QS EVK User Manual (Connection Manual) 1.1
  ~ (2023-03-07) is based on an unversioned 'Hardware Manual' but the current Cavli C16QS LTE
  ~ CAT1.bis Module Hardware Manual is 5.3 (2024-12-07). Module statements in it may be outdated.
Retrieved: HW-v5.3-p027-2(0.9), HW-v5.3-p059-2(0.821), HW-v5.3-p028-1(0.8057), HW-v5.3-p021-1(0.7484), EVK-v1.1-p016-1(0.6705), EVK-v1.1-p015-1(0.6621), EVK-v1.1-p017-1(0.6182), EVK-v1.1-p012-1(0.5874)
```

## 05 / Conflicting evidence goes to review

```text
> python -m docintel ask "Does the C16QS-WW support LTE Band 38?"

Q: Does the C16QS-WW support LTE Band 38?
[CONFLICTING EVIDENCE - expert review]  mode=structured band claims  46 ms
  Conflicting evidence for Band 38 on WW: listed in Cavli C16QS LTE CAT1.bis Module Hardware Manual
  5.3 (pp. 12, 14, 54), but not listed in Cavli C16QS LTE Cat 1bis IoT Module product page
  snapshot-20261114-c81b8bc8 (Technical Data > Cellular Bands Supported). It is not treated as
  confirmed and is queued for expert review (item #4). Evidence: Cavli C16QS LTE CAT1.bis Module
  Hardware Manual 5.3 (p. 12): 1, 2, 3, 4, 5, 7, 8, 12, 13, 18, 19, 20, 25, 26, 28, 38, 40, 41, 66
  [HW-v5.3-p012-2] | Cavli C16QS LTE Cat 1bis IoT Module product page snapshot-20261114-c81b8bc8
  (Technical Data > Cellular Bands Supported): 1, 2, 3, 4, 5, 7, 8, 12, 18, 19, 20, 25, 26, 28, 40,
  41, 66 [WEB-snapshot-20261114-c81b8bc8-s08]
Citations:
  [HW-v5.3-p012-2] Cavli C16QS LTE CAT1.bis Module Hardware Manual, rev 5.3 (current), p. 12, 2.1 Module Introduction
      https://www.tme.eu/Document/236509bdd47a1fae18533456c25b4f7b/C16QS-WW-GNAH-DTE.pdf#page=12
      "2.1 Module Introduction C16QS integrates an application processing subsystem, a communication
      subsystem, multimedia and connectivity peripherals to enable a single chip 4G LTE feature
      phone solution. The C16QS communication subsystem integrates LTE CAT.1bis technology and a RF
      transceiver to cover 1/ 3/ 5/7/ 8/18/19/20/26/28/38/40/41 (E.A.J), 2 / 4/ 5/ 12/
      13/25/66(N.A), 1/3/5/8/20(E.A), 1 / 3/ 5/ 8/ 18/ 19/ 26/ 28 ..."
  [HW-v5.3-p014-1] Cavli C16QS LTE CAT1.bis Module Hardware Manual, rev 5.3 (current), p. 14, 2.2 Module Characteristics
      https://www.tme.eu/Document/236509bdd47a1fae18533456c25b4f7b/C16QS-WW-GNAH-DTE.pdf#page=14
      "Frequency Band LTE BANDS: E.A.J: - 1/ 3/ 5/ 7/ 8/ 18/19/20/26/28/38/40/41 N.A: - 2/ 4/ 5/ 12/
      13/ 25/ 66 A.N: - 1/ 3/ 5/ 8/ 18/ 19/ 26/ 28 L.A: - 1/2/ 3/ 4/ 5/ 7/ 8/ 28 W.W: - 1/ 2/ 3/ 4/
      5/ 7/ 8/ 12/ 13/ 18/ 19/ 20/ 25/ 26/ 28/ 38/ 40/ 41/66 E.A: - 1/3/5/8/20 E.U: - 1/ 3/ 5/ 7/ 8/
      20/ 28 I.N: - 1/3/5/8/40/41 Data Network ✓ FDD/TDD LTE CAT 1.bis ✓ Peak DL 10Mbps/ UL 5Mbps
      (CAT 1.bis) AT Command ✓ Support for ..."
  [HW-v5.3-p054-2] Cavli C16QS LTE CAT1.bis Module Hardware Manual, rev 5.3 (current), p. 54, 4.1 Chapter Overview
      https://www.tme.eu/Document/236509bdd47a1fae18533456c25b4f7b/C16QS-WW-GNAH-DTE.pdf#page=54
      "4.1 Chapter Overview The C16QS module RF overall specifications include the following
      sections: ✓ Working frequency ✓ GNSS Performances ✓ Antenna requirements ✓ 1/ 3/ 5/7/
      8/18/19/20/26/28/38/40/41 (E.A.J), 2 / 4/ 5/ 12/ 13/25/66(N.A), 1/3/5/8/20(E.A), 1 / 3/ 5/ 8/
      18/ 19/ 26/ 28 (A.N), 1/2/ 3/ 4/ 5/7/ 8 (L.A), 1/ 2/ 3/ 4/ 5/ 7/ 8/ 12/13/ 18/ 19/ 20/ 25/ 26/
      28/38/40/ 41/ 66 (W.W),1/3/5/8/40/41(I.N)and 1/ 3/ 5/ 7/ ..."
  [WEB-snapshot-20261114-c81b8bc8-s08] Cavli C16QS LTE Cat 1bis IoT Module product page, rev snapshot-20261114-c81b8bc8 (current), web page (no page numbers), Technical Data > Cellular Bands Supported
      https://www.cavliwireless.com/iot-modules/c-series/c16qs#technical-data
      "Cellular Bands Supported EAJ : 1/ 3/ 5/ 7/ 8/ 18/19/20/26/28/40/41 EU : 1/ 3/ 5/ 7/ 8/ 20/ 28
      NA : 2/ 4/ 5/ 12/ 25/ 66 AN : 1/ 3/ 5/ 8/ 18/ 19/ 26/ 28 LA : 1/2/ 3/ 4/ 5/ 7/ 8 IN :
      1/3/5/8/40/41 WW : 1/ 2/ 3/ 4/ 5/ 7/ 8/ 12/ 18/ 19/ 20/ 25/ 26/ 28/40/ 41/66"
  ~ Review #4 (conflict, high): WW variant LTE band list differs (cross-source); disputed bands: 13,
  ~ 38. Do not treat any disputed band as confirmed.
Retrieved: HW-v5.3-p012-2(0.6758), HW-v5.3-p014-1(0.8521), HW-v5.3-p054-2(None), WEB-snapshot-20261114-c81b8bc8-s08(0.82), HW-v5.3-p074-2(0.5899), WEB-snapshot-20261114-c81b8bc8-s24(0.5624)
```

## 06 / Re-indexing a SIMULATED revision

```text
> python -m docintel --db cache/demo-revision.sqlite simulate-revision
Applying SIMULATED revision c16qs-hardware-manual-5.4-SIMULATED.json
  HW   5.4-SIMULATED                new       (SIMULATED)
  revision: c16qs-hardware-manual revision 5.4-SIMULATED supersedes 5.3: 2 changed page(s)/section(s); numeric values changed: yes.
```

```text
> python -m docintel --db cache/demo-revision.sqlite ask "How long must the C16QS reset pin be held low?"

Q: How long must the C16QS reset pin be held low?
[ANSWERED - see review flags]  mode=gemini:gemini-3.1-flash-lite  1460 ms
  To reset the C16QS module, the reset pin (Pin 17) must be pulled low for 150-500ms. This
  information is provided in a simulated revision of the hardware manual.
  ! Cites a SIMULATED revision - not a Cavli publication.
  ! Passage changed in 5.4-SIMULATED vs 5.3 (p. 31): was “software does not respond, the module can be reset. Pull the pin low for 100-500ms to reset the module. The” (review #7).
Citations:
  [HW-v5.4-SIMULATED-p031-2] Cavli C16QS LTE CAT1.bis Module Hardware Manual, rev 5.4-SIMULATED [SIMULATED] (current), p. 31, 3.4.2 Reset Control
      simulated:sources/simulated/c16qs-hardware-manual-5.4-SIMULATED.json#page=31
      "3.4.2 Reset Control The C16QS module Pin 17th is a reset pin. The application detects that
      the module is abnormal. When the software does not respond, the module can be reset. Pull the
      pin low for 150-500ms to reset the module. The RESET pin is sensitive to interference. A 10nF
      to 0.1uF capacitor can be installed near the signal for signal filtering. Keep away from RF
      interference signals when routing. Figure 6 ..."
  ~ Review #5 (cross_reference_gap, medium): AT+TRB is referenced in Cavli C16QS LTE CAT1.bis Module
  ~ Hardware Manual (rev 5.4-SIMULATED, page 31) but is not documented in the current AT Command
  ~ Manual.
  ~ Review #7 (revision_change, high): c16qs-hardware-manual revision 5.4-SIMULATED supersedes 5.3:
  ~ 2 changed page(s)/section(s); numeric values changed: yes.
Retrieved: HW-v5.4-SIMULATED-p031-2(1.05), HW-v5.4-SIMULATED-p021-1(0.7325), HW-v5.4-SIMULATED-p022-1(0.7222), HW-v5.4-SIMULATED-p030-3(0.6743), HW-v5.4-SIMULATED-p024-1(0.6174), HW-v5.4-SIMULATED-p028-1(0.6128)
```

## 07 / Not verified: unsupported questions

```text
> python -m docintel ask "Is the C16QS certified for use with my custom-designed antenna?"

Q: Is the C16QS certified for use with my custom-designed antenna?
[NOT VERIFIED IN AVAILABLE SOURCES]  mode=guardrail:custom_certification  13 ms
  Not verified in the available C16QS sources. The sources do not certify any specific custom
  antenna or end product. The hardware manual only states the conditions under which the module's
  FCC authorization stays valid, and it names no approved antenna models. Escalate to Cavli support
  and a certification specialist; human approval is required. Related passages shown as context
  only: HW 5.3 p. 75 §9.4.3 OEM Integration Instructions; HW 5.3 p. 76 §9.4.4 Validity of using the
  module certification; HW 5.3 p. 74 §9.3 IC Information.
Related context (not an answer):
  [HW-v5.3-p075-3] Cavli C16QS LTE CAT1.bis Module Hardware Manual rev 5.3, p. 75, 9.4.3 OEM Integration Instructions
  [HW-v5.3-p076-1] Cavli C16QS LTE CAT1.bis Module Hardware Manual rev 5.3, p. 76, 9.4.4 Validity of using the module certification
  [HW-v5.3-p074-1] Cavli C16QS LTE CAT1.bis Module Hardware Manual rev 5.3, p. 74, 9.3 IC Information
Retrieved: HW-v5.3-p075-3(0.8357), HW-v5.3-p076-1(0.7322), HW-v5.3-p074-1(0.6909), HW-v5.3-p078-3(0.7875), HW-v5.3-p077-4(0.7051)
```

```text
> python -m docintel ask "What is the MTBF of the C16QS module?"

Q: What is the MTBF of the C16QS module?
[NOT VERIFIED IN AVAILABLE SOURCES]  mode=coverage threshold  2 ms
  Not verified in the available C16QS sources. The closest passages do not cover the question's key
  terms.
Retrieved:
```
