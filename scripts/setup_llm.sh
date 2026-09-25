#!/bin/bash
# Setup script to pull the specific Qwen2.5 model used by AegisGraph AI

echo "Pulling Qwen2.5-3B-Instruct GGUF via Ollama..."
ollama pull hf.co/bartowski/Qwen2.5-3B-Instruct-GGUF:Q4_K_M
echo "Model pulled successfully."
