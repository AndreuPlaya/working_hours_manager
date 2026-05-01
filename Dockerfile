FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml .
COPY working_hours/ working_hours/
RUN pip install --no-cache-dir ".[editor]"

WORKDIR /data
ENV PYTHONUNBUFFERED=1

CMD ["working-hours-editor"]
