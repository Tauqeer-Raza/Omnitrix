ARG PYTHON_IMAGE=python:3.12-slim-bookworm
FROM ${PYTHON_IMAGE}
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv/omnitrix
COPY requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock && useradd --create-home --uid 10001 omnitrix
COPY app ./app
RUN mkdir -p data && chown -R omnitrix:omnitrix /srv/omnitrix
USER omnitrix
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
