# Use Alpine-based Node.js image for minimal attack surface
FROM node:18-alpine

# Set working directory inside container
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy the rest of the code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Run the app
CMD ["npm", "start"]
