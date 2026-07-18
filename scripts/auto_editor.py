import os
import sys
import argparse
from moviepy.editor import VideoFileClip, concatenate_videoclips
from pydub import AudioSegment
from pydub.silence import detect_nonsilent

def detect_voice_segments(audio_path, min_silence_len=500, silence_thresh=-40):
    """
    Detecta segmentos com áudio (voz) usando pydub.
    """
    audio = AudioSegment.from_file(audio_path)
    # Retorna lista de [start, end] em milissegundos
    segments = detect_nonsilent(audio, min_silence_len=min_silence_len, silence_thresh=silence_thresh)
    return [[start / 1000, end / 1000] for start, end in segments]

def main():
    parser = argparse.ArgumentParser(description="Auto-Editor Pro - Detecta e remove silêncios de vídeos.")
    parser.add_argument("input", help="Caminho do arquivo de vídeo")
    parser.add_argument("--output", default="output_viral.mp4", help="Nome do arquivo de saída")
    parser.add_argument("--silence-len", type=int, default=500, help="Duração mínima de silêncio para corte (ms)")
    parser.add_argument("--threshold", type=int, default=-40, help="Limite de decibéis para considerar silêncio (ex: -40)")
    parser.add_argument("--fade", type=float, default=0.1, help="Adiciona crossfade suave entre cortes (s)")

    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Erro: Arquivo {args.input} não encontrado.")
        sys.exit(1)

    print(f"[*] Carregando vídeo: {args.input}")
    video = VideoFileClip(args.input)
    
    # Extrair áudio temporário para análise
    temp_audio = "temp_audio.wav"
    video.audio.write_audiofile(temp_audio, fps=22050, verbose=False, logger=None)

    print(f"[*] Analisando silêncios (Threshold: {args.threshold}dB, Min Len: {args.silence_len}ms)...")
    voice_segments = detect_voice_segments(temp_audio, args.silence_len, args.threshold)
    
    if not voice_segments:
        print("[!] Nenhum segmento de voz detectado. Verifique o threshold.")
        os.remove(temp_audio)
        return

    print(f"[*] Encontrados {len(voice_segments)} segmentos. Criando cortes...")
    clips = []
    for start, end in voice_segments:
        # Criar subclip e aplicar pequeno fade
        clip = video.subclip(start, end)
        if args.fade > 0:
            clip = clip.crossfadein(args.fade).crossfadeout(args.fade)
        clips.append(clip)

    print("[*] Renderizando vídeo final...")
    final_video = concatenate_videoclips(clips, method="compose")
    final_video.write_videofile(args.output, codec="libx264", audio_codec="aac")

    # Limpeza
    os.remove(temp_audio)
    print(f"[SUCCESS] Vídeo editado com sucesso: {args.output}")

if __name__ == "__main__":
    main()
