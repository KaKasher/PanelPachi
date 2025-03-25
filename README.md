# PanelPachi - AI Manga Editing Tool

PanelPachi is a web application designed to streamline the manga editing process using machine learning-powered tools. It enables users to remove unwanted text, objects, and sound effects (SFX) from manga pages, translate Japanese text seamlessly, and reinsert translated text into the correct positions.

## Features
- **Inpainting**: Remove unwanted objects, text, or SFX from manga pages using AI-powered inpainting.
- **Text Detection & Translation**: Utilize [manga-ocr](https://github.com/kha-white/manga-ocr) for accurate Japanese text detection and the DeepL API for real-time translation.
- **Text Repositioning**: Place translated text in the appropriate locations within the manga page.
- **Download Edited Pages**: Save the modified manga page with clean edits and translations.

## Installation & Setup
### Local Deployment with Docker
1. Clone the repository:
   ```bash
   git clone https://github.com/KaKasher/PanelPachi.git
   cd PanelPachi
   ```

2. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

3. Edit the `.env` file and add your DeepL API key:
   ```
   DEEPL_API_KEY=your-api-key-here
   ```

4. Build and start the containers:
   ```bash
   docker compose up --build
   ```

5. Access the application:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000


## TODO
- Add multiple page support
- Add AI Generated SFX

---
Stay tuned for updates and improvements!
