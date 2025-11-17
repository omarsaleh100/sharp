# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Gunicorn is a production-ready server
# We need to install it
RUN pip install gunicorn

# Tell the container what command to run when it starts
# It will run your 'app' object from the 'app.py' file
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 app:app