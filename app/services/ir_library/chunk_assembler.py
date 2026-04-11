"""
Chunk-based download manager with pause/resume and assembly support.
Implements HTTP Range requests for partial downloads and resumable transfers.
"""

import asyncio
import hashlib
import json
import logging
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

import aiohttp

logger = logging.getLogger(__name__)


@dataclass
class ChunkInfo:
    """Represents a single download chunk."""
    index: int
    start_byte: int
    end_byte: int
    size: int
    downloaded: bool = False
    checksum: Optional[str] = None
    retry_count: int = 0


@dataclass
class FileDownloadTask:
    """Represents a complete file download with chunk support."""
    filename: str
    url: str
    total_size: int
    output_path: str
    state: str = "PENDING"  # PENDING, DOWNLOADING, PAUSED, COMPLETED, FAILED

    # Progress tracking
    downloaded_bytes: int = 0
    chunks: list[ChunkInfo] = field(default_factory=list)
    current_chunk: Optional[int] = None

    # Stats
    speed_bps: float = 0.0
    eta_seconds: Optional[float] = None
    retry_count: int = 0
    error_message: Optional[str] = None

    # Checksum
    checksum: Optional[str] = None
    checksum_algorithm: str = "sha256"

    # Paths
    part_file_path: str = ""
    manifest_path: str = ""

    # Timing
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    paused_at: Optional[datetime] = None

    def to_dict(self):
        """Convert to dictionary for JSON serialization."""
        data = asdict(self)
        # Convert datetime objects to ISO format strings
        for key in ['started_at', 'completed_at', 'paused_at']:
            if data[key]:
                data[key] = data[key].isoformat()
        # Convert ChunkInfo objects to dicts
        data['chunks'] = [asdict(chunk) for chunk in self.chunks]
        return data


class ChunkAssembler:
    """Handles chunk-based downloading with pause/resume support."""

    DEFAULT_CHUNK_SIZE = 1024 * 1024  # 1MB
    MANIFEST_VERSION = 1

    def __init__(
        self,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        max_retries: int = 3,
        timeout: int = 30,
    ):
        self.chunk_size = chunk_size
        self.max_retries = max_retries
        self.timeout = timeout
        self._cancel_requested = False

    def cancel(self):
        """Request cancellation of current download."""
        self._cancel_requested = True

    async def download_chunked(
        self,
        url: str,
        output_path: str,
        checksum: Optional[str] = None,
        checksum_algorithm: str = "sha256",
        chunk_size: Optional[int] = None,
        resume: bool = True,
        progress_callback: Optional[Callable[[FileDownloadTask], None]] = None,
    ) -> FileDownloadTask:
        """
        Download file in chunks with resume support.

        Args:
            url: File URL to download
            output_path: Path where to save the file
            checksum: Expected file checksum
            checksum_algorithm: Hash algorithm (sha256, md5, etc)
            chunk_size: Size of each chunk
            resume: Whether to resume from .part file if exists
            progress_callback: Callback function called with progress updates

        Returns:
            FileDownloadTask with download results
        """
        self._cancel_requested = False
        chunk_size = chunk_size or self.chunk_size

        # Create output directory if needed
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        # Initialize task
        task = FileDownloadTask(
            filename=Path(output_path).name,
            url=url,
            output_path=output_path,
            part_file_path=f"{output_path}.part",
            manifest_path=f"{output_path}.manifest.json",
            checksum=checksum,
            checksum_algorithm=checksum_algorithm,
            started_at=datetime.now(timezone.utc),
        )

        try:
            # Get file size from server
            total_size = await self._get_file_size(url)
            if total_size is None or total_size == 0:
                # Server doesn't support Range or file is empty
                logger.warning(f"Could not determine file size for {url}, using fallback download")
                return await self._download_simple(url, output_path, task, progress_callback)

            task.total_size = total_size

            # Check if we can resume
            existing_task = None
            if resume and Path(task.manifest_path).exists():
                existing_task = await self._load_manifest(task.manifest_path)
                if existing_task and existing_task.total_size == total_size:
                    logger.info(f"Resuming download of {task.filename}")
                    task = existing_task
                    task.paused_at = None  # Clear pause timestamp

            # Initialize chunks if not resuming
            if not task.chunks:
                task.chunks = self._create_chunks(total_size, chunk_size)

            # Download chunks
            success = await self._download_chunks(task, progress_callback)

            if not success:
                if self._cancel_requested:
                    task.state = "CANCELLED"
                    logger.info(f"Download cancelled: {task.filename}")
                else:
                    task.state = "FAILED"
                    logger.error(f"Failed to download {task.filename}")
                return task

            # Assemble chunks
            if not await self._assemble_chunks(task):
                task.state = "FAILED"
                task.error_message = "Failed to assemble chunks"
                return task

            # Verify checksum if provided
            if checksum:
                verified = await self._verify_checksum(output_path, checksum, checksum_algorithm)
                if not verified:
                    task.state = "FAILED"
                    task.error_message = f"Checksum mismatch (expected {checksum_algorithm}: {checksum})"
                    logger.error(f"Checksum verification failed: {task.filename}")
                    return task

            # Cleanup
            await self._cleanup_chunks(task)

            task.state = "COMPLETED"
            task.downloaded_bytes = total_size
            task.completed_at = datetime.now(timezone.utc)
            logger.info(f"Successfully downloaded {task.filename}")

            return task

        except asyncio.CancelledError:
            task.state = "CANCELLED"
            logger.info(f"Download cancelled by user: {task.filename}")
            raise
        except Exception as e:
            task.state = "FAILED"
            task.error_message = str(e)
            logger.error(f"Error downloading {task.filename}: {e}")
            return task

    async def _get_file_size(self, url: str) -> Optional[int]:
        """Get file size from server using HEAD request."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.head(url, timeout=aiohttp.ClientTimeout(total=self.timeout)) as response:
                    if response.status == 200:
                        size = response.content_length
                        # Check if server supports Range requests
                        accept_ranges = response.headers.get('Accept-Ranges', '').lower()
                        if accept_ranges != 'bytes':
                            logger.warning(f"Server does not support Range requests for {url}")
                            return None
                        return size
        except Exception as e:
            logger.warning(f"Failed to get file size from {url}: {e}")
        return None

    def _create_chunks(self, total_size: int, chunk_size: int) -> list[ChunkInfo]:
        """Create chunk definitions for file."""
        chunks = []
        num_chunks = (total_size + chunk_size - 1) // chunk_size

        for i in range(num_chunks):
            start = i * chunk_size
            end = min((i + 1) * chunk_size - 1, total_size - 1)
            chunk = ChunkInfo(
                index=i,
                start_byte=start,
                end_byte=end,
                size=end - start + 1,
            )
            chunks.append(chunk)

        return chunks

    async def _download_chunks(
        self,
        task: FileDownloadTask,
        progress_callback: Optional[Callable] = None,
    ) -> bool:
        """Download all chunks, skipping already completed ones."""
        # Filter chunks that need downloading
        pending_chunks = [c for c in task.chunks if not c.downloaded]

        if not pending_chunks:
            logger.info(f"All chunks already downloaded for {task.filename}")
            task.downloaded_bytes = task.total_size
            if progress_callback:
                await self._run_callback(progress_callback, task)
            return True

        logger.info(f"Downloading {len(pending_chunks)} chunks for {task.filename}")

        # Semaphore for concurrent downloads (limit to 4 concurrent chunks)
        semaphore = asyncio.Semaphore(4)

        async def download_chunk_with_limit(chunk):
            async with semaphore:
                return await self._download_chunk(task, chunk, progress_callback)

        # Download chunks concurrently
        results = await asyncio.gather(
            *[download_chunk_with_limit(chunk) for chunk in pending_chunks],
            return_exceptions=True
        )

        # Check for failures
        failed = [r for r in results if isinstance(r, Exception) or r is False]
        if failed:
            logger.error(f"Failed to download {len(failed)} chunks")
            return False

        # Save manifest
        await self._save_manifest(task)

        return True

    async def _download_chunk(
        self,
        task: FileDownloadTask,
        chunk: ChunkInfo,
        progress_callback: Optional[Callable] = None,
    ) -> bool:
        """Download a single chunk with retry support."""
        for attempt in range(self.max_retries):
            if self._cancel_requested:
                return False

            try:
                task.current_chunk = chunk.index
                headers = {
                    'Range': f'bytes={chunk.start_byte}-{chunk.end_byte}',
                }

                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        task.url,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=self.timeout),
                        allow_redirects=True
                    ) as response:
                        if response.status not in (200, 206):
                            if attempt < self.max_retries - 1:
                                await asyncio.sleep(2 ** attempt)  # Exponential backoff
                                continue
                            logger.error(f"Failed to download chunk {chunk.index}: HTTP {response.status}")
                            return False

                        # Write chunk to file
                        chunk_data = await response.read()

                        # Verify chunk size
                        if len(chunk_data) != chunk.size:
                            logger.warning(f"Chunk {chunk.index} size mismatch: got {len(chunk_data)}, expected {chunk.size}")
                            if attempt < self.max_retries - 1:
                                await asyncio.sleep(2 ** attempt)
                                continue
                            return False

                        # Write to part file
                        part_file = Path(task.part_file_path)
                        part_file.parent.mkdir(parents=True, exist_ok=True)

                        with open(part_file, 'r+b' if part_file.exists() else 'wb') as f:
                            f.seek(chunk.start_byte)
                            f.write(chunk_data)

                        # Calculate checksum
                        chunk.checksum = hashlib.sha256(chunk_data).hexdigest()
                        chunk.downloaded = True
                        chunk.retry_count = attempt

                        # Update progress
                        task.downloaded_bytes = sum(c.size for c in task.chunks if c.downloaded)
                        if progress_callback:
                            await self._run_callback(progress_callback, task)

                        logger.debug(f"Downloaded chunk {chunk.index}/{len(task.chunks)} for {task.filename}")
                        return True

            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"Error downloading chunk {chunk.index} (attempt {attempt + 1}): {e}")
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                else:
                    return False

        return False

    async def _download_simple(
        self,
        url: str,
        output_path: str,
        task: FileDownloadTask,
        progress_callback: Optional[Callable] = None,
    ) -> FileDownloadTask:
        """Fallback to simple (non-chunked) download for servers without Range support."""
        logger.info(f"Falling back to simple download for {task.filename}")

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    timeout=aiohttp.ClientTimeout(total=self.timeout),
                    allow_redirects=True
                ) as response:
                    if response.status != 200:
                        task.state = "FAILED"
                        task.error_message = f"HTTP {response.status}"
                        return task

                    total_size = response.content_length or 0
                    task.total_size = total_size

                    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

                    with open(output_path, 'wb') as f:
                        async for chunk in response.content.iter_chunked(8192):
                            if self._cancel_requested:
                                task.state = "CANCELLED"
                                return task

                            f.write(chunk)
                            task.downloaded_bytes += len(chunk)

                            if progress_callback:
                                await self._run_callback(progress_callback, task)

                    task.state = "COMPLETED"
                    task.completed_at = datetime.now(timezone.utc)
                    return task

        except Exception as e:
            task.state = "FAILED"
            task.error_message = str(e)
            return task

    async def _assemble_chunks(self, task: FileDownloadTask) -> bool:
        """Assemble downloaded chunks into final file."""
        try:
            logger.info(f"Assembling chunks for {task.filename}")

            output_path = Path(task.output_path)
            part_file = Path(task.part_file_path)

            if not part_file.exists():
                logger.error(f"Part file not found: {part_file}")
                return False

            # Verify all chunks are downloaded
            if not all(chunk.downloaded for chunk in task.chunks):
                logger.error(f"Not all chunks downloaded for {task.filename}")
                return False

            # Move part file to final location
            part_file.rename(output_path)
            logger.info(f"Assembled {len(task.chunks)} chunks into {output_path}")

            return True

        except Exception as e:
            logger.error(f"Failed to assemble chunks: {e}")
            return False

    async def _verify_checksum(
        self,
        file_path: str,
        expected: str,
        algorithm: str = "sha256",
    ) -> bool:
        """Verify file checksum."""
        try:
            hasher = hashlib.new(algorithm)

            with open(file_path, 'rb') as f:
                while True:
                    chunk = f.read(8192)
                    if not chunk:
                        break
                    hasher.update(chunk)

            actual = hasher.hexdigest()
            if actual.lower() != expected.lower():
                logger.error(f"Checksum mismatch: expected {expected}, got {actual}")
                return False

            logger.info(f"Checksum verified for {file_path}")
            return True

        except Exception as e:
            logger.error(f"Error verifying checksum: {e}")
            return False

    async def _cleanup_chunks(self, task: FileDownloadTask):
        """Clean up temporary chunk files and manifest."""
        try:
            # Remove part file if exists
            part_file = Path(task.part_file_path)
            if part_file.exists():
                part_file.unlink()

            # Remove manifest if exists
            manifest_file = Path(task.manifest_path)
            if manifest_file.exists():
                manifest_file.unlink()

            logger.debug(f"Cleaned up temporary files for {task.filename}")
        except Exception as e:
            logger.warning(f"Error cleaning up temporary files: {e}")

    async def _save_manifest(self, task: FileDownloadTask):
        """Save download manifest for resume capability."""
        try:
            manifest = {
                'version': self.MANIFEST_VERSION,
                'task': task.to_dict(),
                'timestamp': datetime.now(timezone.utc).isoformat(),
            }

            with open(task.manifest_path, 'w') as f:
                json.dump(manifest, f, indent=2)

            logger.debug(f"Saved manifest for {task.filename}")
        except Exception as e:
            logger.warning(f"Failed to save manifest: {e}")

    async def _load_manifest(self, manifest_path: str) -> Optional[FileDownloadTask]:
        """Load download manifest for resume."""
        try:
            with open(manifest_path, 'r') as f:
                data = json.load(f)

            task_data = data.get('task', {})

            # Reconstruct FileDownloadTask
            task = FileDownloadTask(
                filename=task_data.get('filename', ''),
                url=task_data.get('url', ''),
                total_size=task_data.get('total_size', 0),
                output_path=task_data.get('output_path', ''),
                state=task_data.get('state', 'PENDING'),
                downloaded_bytes=task_data.get('downloaded_bytes', 0),
                checksum=task_data.get('checksum'),
                checksum_algorithm=task_data.get('checksum_algorithm', 'sha256'),
                part_file_path=task_data.get('part_file_path', ''),
                manifest_path=task_data.get('manifest_path', ''),
            )

            # Reconstruct chunks
            task.chunks = [
                ChunkInfo(
                    index=c['index'],
                    start_byte=c['start_byte'],
                    end_byte=c['end_byte'],
                    size=c['size'],
                    downloaded=c.get('downloaded', False),
                    checksum=c.get('checksum'),
                    retry_count=c.get('retry_count', 0),
                )
                for c in task_data.get('chunks', [])
            ]

            logger.debug(f"Loaded manifest from {manifest_path}")
            return task

        except Exception as e:
            logger.warning(f"Failed to load manifest: {e}")
            return None

    async def _run_callback(self, callback: Callable, task: FileDownloadTask):
        """Run progress callback, handling both sync and async functions."""
        try:
            if asyncio.iscoroutinefunction(callback):
                await callback(task)
            else:
                callback(task)
        except Exception as e:
            logger.warning(f"Error in progress callback: {e}")
