# Builds outputs/Cavli_A02_demo.mp4 from the captured frames (scripts/capture_demo.py) plus Windows TTS narration.
# Requires ffmpeg/ffprobe on PATH. Run from round3-assignment2:  powershell -File scripts/record-demo.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$chapters = @(
  'This is the documentation intelligence prototype for the Cavli C sixteen Q S module. It answers technical questions from four public sources: the hardware manual, release five point three; the evaluation kit user manual, release one point one; the A T command manual, release three point one; and the official product page. The sources command lists each document with its revision, its date from the version history, whether it is current, its page count, and how the file was obtained. Document identity is kept separate from revision identity, and every file is checked against a pinned S H A two fifty six hash. The manuals are not bundled, because they carry a Cavli copyright notice. Ingest downloads them from the public links instead.',
  'Ingest is repeatable. Running it again finds the same extracted text hash for every source, so nothing is duplicated. Here the product page was downloaded live again, and because its text hash did not change, no new snapshot was created. After every ingest, automatic checks look for problems in the documentation itself. They found six. Four are band list conflicts between the hardware manual and the product page. One is an A T command named in the hardware manual that the A T manual does not document. And one is an evaluation kit manual that relies on an unversioned, older hardware manual. All six go to an expert review queue. Nothing is corrected automatically.',
  'Here is an answerable question about the bare module reset pin. The answer, pin seventeen pulled low for one hundred to five hundred milliseconds, is written by Gemini three point one flash lite using only the retrieved passages. The citation gives the document title, the revision and whether it is current, printed page thirty one, and section three point four point two. Its link opens the P D F at that page, and the exact passage is quoted. A validator rejects any answer that cites a passage that was not retrieved, or that contains a number missing from the cited text. The review flag points out the undocumented A T plus T R B command on the same page.',
  'This question is ambiguous. Supply voltage means different things for the bare module and for the evaluation board. Instead of guessing, the system answers each scope separately and asks a clarifying question. For the module, it cites the V bat range of three point one to four point five volts, typically three point eight. For the evaluation kit, it cites the jumper that selects U S B type C or the five volt adapter. Because the evaluation kit manual predates the current hardware manual, a low severity outdated reference flag is also shown.',
  'Does the worldwide variant support band thirty eight? Hardware manual five point three lists band thirty eight for W W on pages twelve, fourteen and fifty four. The product page leaves it out of the W W list. Both sources give bands per regional variant, not per S K U, so this is a real conflict at the same scope. The system shows both passages, does not confirm the band, and links the open expert review item. Band answers are built from structured band claims rather than by the language model, and a band list is never treated as proof of carrier compatibility.',
  'To show re-indexing, I needed a second revision. The public version five point one manual could not be retrieved, so I used a clearly labelled simulated revision, five point four simulated, which changes the reset pulse to one hundred fifty to five hundred milliseconds. It is applied to a copy of the index only. The older revision is kept but marked superseded. The page diff isolates the changed sentence on page thirty one, and a high severity revision change item is queued. The answer now cites the simulated revision, warns that it is not a Cavli publication, and shows the previous wording.',
  'Some questions cannot be answered from these documents. The manuals cannot confirm certification for a custom antenna, so the answer is not verified. Related F C C passages are shown only as context, with an escalation to Cavli support. A question about M T B F finds no supporting passages at all, so it is refused before any model call. The same standard response is used every time evidence is missing.',
  'Finally, the evaluation. Fourteen predefined cases cover answerable, ambiguous, conflicting, unanswerable and revision questions. With the validator and one retry, all fourteen passed, and every citation was checked again by re-extracting the cited page from the source file. The first run, before the retry was added, failed one case when the model provider timed out, and the extractive only baseline passed ten. Ten new held out questions, written after tuning, passed on a single run. The failures report lists the remaining weaknesses and concrete documentation fixes, such as one band table per S K U, a corrected A T command reference, and versioned downloads with checksums.'
)
$folder = Join-Path (Get-Location) 'outputs/demo/build'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
$synth.Rate = -1
$clips = @()
try {
  for ($i = 0; $i -lt $chapters.Count; $i++) {
    $n = '{0:D2}' -f ($i + 1)
    $wav = Join-Path $folder "$n.wav"
    $clip = Join-Path $folder "$n.mp4"
    $synth.SetOutputToWaveFile($wav)
    $synth.Speak($chapters[$i])
    $synth.SetOutputToNull()
    $seconds = [double](& ffprobe -v error -show_entries format=duration -of csv=p=0 $wav) + 2.5
    & ffmpeg -loglevel error -y -loop 1 -framerate 5 -i "outputs/demo/frames/$n.png" -i $wav `
      -af "apad=whole_dur=$seconds" -t $seconds -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 96k $clip
    if ($LASTEXITCODE -ne 0) { throw "Could not render chapter $n" }
    $clips += "file '$n.mp4'"
  }
} finally { $synth.Dispose() }
$list = Join-Path $folder 'clips.txt'
Set-Content -LiteralPath $list -Value $clips -Encoding ascii
& ffmpeg -loglevel error -y -f concat -safe 0 -i $list -c copy -movflags +faststart outputs/Cavli_A02_demo.mp4
if ($LASTEXITCODE -ne 0) { throw 'Could not assemble demo' }
& ffprobe -v error -show_entries format=duration,size -of default=nw=1 outputs/Cavli_A02_demo.mp4
