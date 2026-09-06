"""Local CPU inference, isolated from Express; one bounded request at a time."""
import json
import os
import sys

os.environ.setdefault('OMP_NUM_THREADS', '6')
import ctranslate2
import sentencepiece

model_dir = sys.argv[1]
tokenizer_path = os.path.join(model_dir, 'spiece.model')
if not os.path.isfile(tokenizer_path):
    tokenizer_path = os.path.join(model_dir, 'sentencepiece.model')
tokenizer = sentencepiece.SentencePieceProcessor(model_file=tokenizer_path)
model = ctranslate2.Translator(model_dir, device='cpu', compute_type='int8', intra_threads=6, inter_threads=1)
print(json.dumps({'ready': True}), flush=True)
for line in sys.stdin:
    try:
        job = json.loads(line)
        if job['target'] not in ('ckb', 'ar', 'en'):
            raise ValueError('Unsupported target')
        texts = job['texts']
        if not isinstance(texts, list) or not 1 <= len(texts) <= 50:
            raise ValueError('Invalid batch size')
        if any(not isinstance(text, str) or not text.strip() or len(text) > 2048 for text in texts):
            raise ValueError('Invalid cue')
        # VTT/SRT wrapping is presentation, not a semantic sentence boundary.
        # Each complete cue remains one independently translated batch item.
        source = [' '.join(text.split()) for text in texts]
        tokens = [tokenizer.encode('<2' + job['target'] + '> ' + text, out_type=str) + ['</s>'] for text in source]
        # Never silently truncate dialogue. Long cues fail visibly and can be
        # corrected at their source instead of being cached as partial output.
        if any(len(item) > 512 for item in tokens):
            raise ValueError('Input too long')
        # Beam 2 keeps Sorani/Arabic quality close to beam 4 while cutting the
        # mixed-threading first-window latency measured on the target hardware.
        results = model.translate_batch(tokens, beam_size=2, max_batch_size=20, max_decoding_length=256)
        if any(len(result.hypotheses[0]) >= 256 for result in results):
            raise ValueError('Incomplete output')
        output = [tokenizer.decode(result.hypotheses[0]) for result in results]
        print(json.dumps({'texts': output}, ensure_ascii=False), flush=True)
    except Exception:
        # Diagnostics must never become subtitle text or browser error strings.
        print(json.dumps({'error': True}), flush=True)
