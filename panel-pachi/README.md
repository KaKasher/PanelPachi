# PanelPachi - Manga SFX Editor

A web application for editing and translating manga panel SFX (sound effects).

## Features

- Upload manga panels
- Draw masks for inpainting areas (like Japanese SFX)
- Remove original SFX through inpainting
- Generate new stylized English SFX
- Position and customize the new SFX on the page

## Project Structure

This project uses:
- React with TypeScript
- Fabric.js for canvas manipulation

## Getting Started

### Prerequisites

- Node.js (>=14.0.0)
- npm (>=6.0.0)

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/PanelPachi.git
cd PanelPachi
```

2. Install dependencies
```bash
npm install
```

3. Start the development server
```bash
npm start
```

The application will be available at [http://localhost:3000](http://localhost:3000)

## Usage

1. **Upload a Manga Panel**
   - Drag and drop an image into the upload area
   - Alternatively, click the upload area to select a file from your device
   - Supported formats: JPG, JPEG, PNG

2. **Draw a Mask**
   - After uploading, the image will be displayed
   - Use the Inpainting Mask tool (selected by default)
   - Draw over the areas containing SFX or elements you want to remove
   - The mask appears as a semi-transparent red overlay

3. **Apply Inpainting** (Coming Soon)
   - Once you've created a mask, you will be able to apply inpainting 
   - The inpainting process will remove the masked content

4. **Add English SFX** (Coming Soon)
   - Add new text for the translated SFX
   - Customize the style, size, and position

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
