FROM python:3.12-slim

# Prevents .pyc files and enables unbuffered logging (better for containers).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# # Install build deps only if a package needs compiling (psycopg2, etc.).
# # Drop this block if all your deps are pure-Python or ship wheels.
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     gcc libpq-dev \
#     && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Run as non-root.
RUN useradd --create-home appuser
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]