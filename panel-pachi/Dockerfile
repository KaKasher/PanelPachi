FROM node:20-slim

WORKDIR /app

# Copy package files
COPY ./panel-pachi/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the frontend application
COPY ./panel-pachi .

# Build the application
RUN npm run build

# Expose the port the app runs on
EXPOSE 5173

# Command to run the application
CMD ["npm", "run", "dev"]
